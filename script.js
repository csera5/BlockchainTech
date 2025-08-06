function updateMessage(text, color = "#333") {
  const msg = document.getElementById('message');
  msg.style.color = color;
  msg.innerHTML += `<div class="step-msg">${text}</div>`;
}

function setProgress(percent) {
  const bar = document.getElementById('progressBarInner');
  bar.style.width = percent + "%";
  bar.textContent = percent + "%";
}

document.querySelectorAll('input[name="inputType"]').forEach(input => {
  input.addEventListener('change', (e) => {
    const fileDiv = document.getElementById('fileInputDiv');
    const urlDiv = document.getElementById('urlInputDiv');
    if (e.target.value === "file") {
      fileDiv.style.display = "block";
      urlDiv.style.display = "none";
    } else {
      fileDiv.style.display = "none";
      urlDiv.style.display = "block";
    }
  });
});

document.getElementById('uploadForm').addEventListener('submit', async function (event) {
  event.preventDefault();

  const fileInput = document.getElementById('myfile');
  const imageUrlInput = document.getElementById('imageUrl');
  const signerInput = document.querySelector('input[name="signer"]');
  const licenseInput = document.querySelector('input[name="license"]');
  const usageInput = document.querySelector('input[name="usage"]');
  const selectedType = document.querySelector('input[name="inputType"]:checked').value;

  const formData = new FormData();
  if (selectedType === "file") {
    if (fileInput.files.length === 0) {
      updateMessage("Please select a file.", "#c0392b");
      return;
    }
    formData.append("myfile", fileInput.files[0]);
  } else {
    updateMessage("Image URL upload not implemented yet.", "#c0392b");
    return;
  }

  formData.append("signer", signerInput.value);
  formData.append("license", licenseInput.value);
  formData.append("usage", usageInput.value);

  document.getElementById('message').innerHTML = "";
  setProgress(10);
  updateMessage("🔧 Step 1: Preparing image...");

  try {
    const response = await fetch('/upload', { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`Upload failed`);
    setProgress(40);

    const { hash: imageHash, ipfsCID } = await response.json();
    updateMessage("📁 Step 2: Image uploaded & fingerprinted.");
    updateMessage(`🔐 Fingerprint: <code>${imageHash}</code>`);
    updateMessage(`📡 IPFS Link: <a href="https://green-charming-chipmunk-392.mypinata.cloud/ipfs/${ipfsCID}" target="_blank">${ipfsCID}</a>`);
    setProgress(60);

    const proofRes = await fetch('/submit-proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipfsCID,
        imageHash,
        signer: signerInput.value,
        license: licenseInput.value,
        usage: usageInput.value
      })
    });

    const proofResData = await proofRes.json();
    if (!proofRes.ok) throw new Error("Blockchain proof submission failed.");
    const { txHash } = proofResData;

    updateMessage("✅ Step 3: Image metadata certified on Cardano.");
    updateMessage(`🔗 Step 4: View TX: <a href="https://preprod.cardanoscan.io/transaction/${txHash}" target="_blank">${txHash}</a>`, "#27ae60");
    setProgress(100);
  } catch (err) {
    updateMessage(`❌ Error: ${err.message}`, "#c0392b");
    setProgress(0);
  }
});
