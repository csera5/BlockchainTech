import { Lucid } from "lucid-cardano";

const lucid = await Lucid.new(undefined, "Preprod");
const privateKey = lucid.utils.generatePrivateKey();
console.log("Private key (save this):", privateKey);
