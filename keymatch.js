import { Lucid } from "lucid-cardano";
import dotenv from "dotenv";
dotenv.config();

async function verifyKeyMatchesAddress() {
  const lucid = await Lucid.new(undefined, "Preprod");
  const privateKey = process.env.PRIVATE_KEY; // should be ed25519_sk...
  const targetAddress = process.argv[2]; // pass the address to verify

  if (!privateKey || !targetAddress) {
    console.error("❌ Usage: node verify-key-match.js <addr_test...>");
    return;
  }

  lucid.selectWalletFromPrivateKey(privateKey);
  const derivedAddress = await lucid.wallet.address();

  if (derivedAddress === targetAddress) {
    console.log("✅ The private key matches the address.");
  } else {
    console.log("❌ Mismatch:");
    console.log("→ Derived address: ", derivedAddress);
    console.log("→ Expected address:", targetAddress);
  }
}

verifyKeyMatchesAddress();
