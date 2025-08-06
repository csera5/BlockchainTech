import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import PinataSDK from '@pinata/sdk';
import { Lucid, Blockfrost, fromText } from 'lucid-cardano';
import { C } from "lucid-cardano";
import fetch from "node-fetch";
import exifr from 'exifr'; 
import dotenv from 'dotenv';

dotenv.config();

const cachePath = './image_hash_cache.json';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

const pinata = new PinataSDK(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_API_KEY);

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = crypto.randomBytes(16).toString("hex") + ext;
    cb(null, unique);
  }
});
const upload = multer({ storage });

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const processedFolder = path.join(__dirname, 'processed_images');
if (!fs.existsSync(processedFolder)) fs.mkdirSync(processedFolder);

async function processImage(filePath, filename) {
  const outputPath = path.join(processedFolder, `${filename}.png`);
  await sharp(filePath).resize(256, 256).toFormat('png').toFile(outputPath);
  return outputPath;
}

async function generateImageHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function uploadToIPFS(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const options = {
    pinataMetadata: { name: path.basename(filePath) },
    pinataOptions: { cidVersion: 1 }
  };
  const result = await pinata.pinFileToIPFS(fileStream, options);
  return result.IpfsHash;
}

function loadHashCache() {
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath));
  }
  return {};
}

function saveHashToCache(hash, metadata) {
  const cache = loadHashCache();
  cache[hash] = metadata;
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

app.post('/upload', upload.single('myfile'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  try {
    const processedPath = await processImage(req.file.path, req.file.filename);
    const imageHash = await generateImageHash(processedPath);
    const ipfsCID = await uploadToIPFS(processedPath);

    let exifData = await exifr.parse(req.file.path, { gps: true });
    const metadata = {
      ipfsCID,
      timestamp: new Date().toISOString(),
      signer: req.body.signer || "Anonymous",
      location:
        exifData?.latitude && exifData?.longitude
          ? `${exifData.latitude}, ${exifData.longitude}`
          : "Unknown",
      imageTimestamp: exifData?.DateTimeOriginal || null,
      cameraModel: exifData?.Model || null,
      software: exifData?.Software || null,
      make: exifData?.Make || null
    };

    saveHashToCache(imageHash, metadata);

    res.send({ message: 'Image uploaded and stored on IPFS!', hash: imageHash, ipfsCID });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error during image processing/upload.');
  }
});

app.post('/submit-proof', async (req, res) => {
  console.log("📥 /submit-proof called");
  console.log("📦 Incoming metadata:", req.body);

  const { ipfsCID, imageHash, signer } = req.body;
  if (!ipfsCID || !imageHash || !signer)
    return res.status(400).json({ error: 'Missing required metadata fields.' });

  try {
    const lucid = await Lucid.new(
      new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", process.env.BLOCKFROST_API_KEY),
      "Preprod"
    );

    const rawKey = fs.readFileSync('./minting.skey', 'utf8').trim();
    lucid.selectWalletFromPrivateKey(rawKey);

    const address = await lucid.wallet.address();
    const assetNameText = "ImageAuthNFT";
    const assetName = fromText(assetNameText);
    const policyId = "1d82a7b3c1a04a60f4be8edcb675bbf091f3de3ab4e6bfa5f8f574d3";

    const exif = loadHashCache()[imageHash] || {};

    function truncate(str, maxBytes = 63) {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(str);
      if (encoded.length <= maxBytes) return str;
      let slice = encoded.slice(0, maxBytes);
      let result = "";
      for (let i = slice.length; i > 0; i--) {
        try {
          result = new TextDecoder().decode(slice.slice(0, i));
          break;
        } catch {
          continue;
        }
      }
      return result;
    }

    const metadata = {
      721: {
        [policyId]: {
          [assetName]: {
            name: truncate(assetNameText),
            image: truncate(`ipfs://${ipfsCID}`),
            mediaType: "image/png",
            description: "Authenticated image",
            hash: imageHash,
            signer: truncate(signer),
            location: truncate(exif.location || "Unknown"),
            timestamp: truncate(exif.imageTimestamp || new Date().toISOString()),
            cameraModel: truncate(exif.cameraModel || "Unknown"),
            software: truncate(exif.software || "Unknown"),
            make: truncate(exif.make || "Unknown")
          }
        }
      }
    };

    const tx = await lucid
      .newTx()
      .attachMetadata(721, metadata["721"])
      .payToAddress(address, { lovelace: BigInt(2000000) });

    const txComplete = await tx.complete();
    const witnessSet = await lucid.wallet.signTx(txComplete.txComplete);
    const signedTx = C.Transaction.new(
      txComplete.txComplete.body(),
      witnessSet,
      txComplete.txComplete.auxiliary_data()
    );

    const hexTx = Buffer.from(signedTx.to_bytes()).toString("hex");
    const txHash = await lucid.wallet.submitTx(hexTx);

    console.log("✅ TX Hash:", txHash);
    res.json({ txHash });
  } catch (err) {
    console.error("❌ TX failed:", err);
    res.status(500).json({ error: err.message || 'Transaction error' });
  }
});

app.post('/verify-image', upload.single('verifyfile'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  try {
    const processedPath = await processImage(req.file.path, req.file.filename);
    const imageHash = await generateImageHash(processedPath);
    console.log("🔍 Verifying hash:", imageHash);

    const cache = loadHashCache();
    const metadata = cache[imageHash];

    if (metadata) {
      return res.json({ match: true, hash: imageHash, ...metadata });
    } else {
      return res.json({ match: false, hash: imageHash });
    }
  } catch (err) {
    console.error("❌ Verification failed:", err);
    res.status(500).json({ error: 'Verification error.' });
  }
});


app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
