import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY;
const address = process.argv[2]; // pass address from command line

if (!BLOCKFROST_API_KEY) {
  console.error("❌ Missing BLOCKFROST_API_KEY in .env");
  process.exit(1);
}

if (!address) {
  console.error("❌ Please pass the wallet address as an argument.");
  console.log("Usage: node check-utxos.js <addr_test...>");
  process.exit(1);
}

async function checkUtxos(addr) {
  const url = `https://cardano-preprod.blockfrost.io/api/v0/addresses/${addr}/utxos`;
  const res = await fetch(url, {
    headers: {
      project_id: BLOCKFROST_API_KEY,
    },
  });

  if (!res.ok) {
    console.error("❌ Blockfrost API error:", res.status, await res.text());
    return;
  }

  const utxos = await res.json();
  if (utxos.length === 0) {
    console.log("⚠️ No UTxOs found — wallet may be empty or funds not yet confirmed.");
  } else {
    console.log(`✅ Found ${utxos.length} UTxO(s):`);
    for (const utxo of utxos) {
      console.log(`- tx_hash: ${utxo.tx_hash}`);
      console.log(`  output_index: ${utxo.output_index}`);
      console.log(`  amount:`, utxo.amount.map(a => `${a.quantity} ${a.unit}`).join(", "));
    }
  }
}

checkUtxos(address);