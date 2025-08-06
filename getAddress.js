import { Lucid, Blockfrost } from "lucid-cardano";
import fs from "fs";

const privateKey = fs.readFileSync("./minting.skey", "utf8").trim();

const BLOCKFROST_API_KEY = "preprodGutQ2SLIvLzrh00csfVafWwK87WtyA8J"; 

const main = async () => {
  const lucid = await Lucid.new(
    new Blockfrost("https://cardano-preprod.blockfrost.io/api/v0", BLOCKFROST_API_KEY),
    "Preprod"
  );

  lucid.selectWalletFromPrivateKey(privateKey);

  const address = await lucid.wallet.address();
  console.log("✅ Public Address:", address);
};

main();
