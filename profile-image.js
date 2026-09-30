// Shared browser-side image validation and compression. No storage or account writes.
function safeProfileImage(value) {
  const image = typeof value === "string" ? value : "";
  return image.length <= 200000 && /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image) ? image : "";
}

function fileAsDataUrl(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error("The image could not be read.")); };
    reader.readAsDataURL(file);
  });
}

function canvasAsBlob(canvas, quality) {
  return new Promise(function (resolve) {
    canvas.toBlob(resolve, "image/webp", quality);
  });
}

async function makeProfileIcon(file, position = { zoom: 1, x: 50, y: 50 }) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise(function (resolve, reject) {
      const source = new Image();
      source.onload = function () { resolve(source); };
      source.onerror = function () { reject(new Error("The image could not be opened.")); };
      source.src = objectUrl;
    });
    const crop = Math.min(image.naturalWidth, image.naturalHeight) / Math.max(1, Math.min(3, Number(position.zoom) || 1));
    const startX = Math.max(0, image.naturalWidth - crop) * Math.max(0, Math.min(100, Number(position.x))) / 100;
    const startY = Math.max(0, image.naturalHeight - crop) * Math.max(0, Math.min(100, Number(position.y))) / 100;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    canvas.getContext("2d").drawImage(image, startX, startY, crop, crop, 0, 0, 256, 256);
    for (const quality of [0.82, 0.7, 0.58]) {
      const blob = await canvasAsBlob(canvas, quality);
      if (blob && blob.size <= 145000) return fileAsDataUrl(blob);
    }
    throw new Error("That image could not be made small enough. Try another image.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function cropProfileIcon(file) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPG, or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
  const url = URL.createObjectURL(file);
  const dialog = document.createElement('dialog'); dialog.className = 'image-crop-dialog';
  dialog.innerHTML = '<h2>Position your icon.</h2><p>The square preview is what other members will see.</p><canvas width="256" height="256" aria-label="Cropped image preview"></canvas><label>Zoom<input name="zoom" type="range" min="1" max="3" step="0.05" value="1"></label><label>Horizontal position<input name="x" type="range" min="0" max="100" value="50"></label><label>Vertical position<input name="y" type="range" min="0" max="100" value="50"></label><div class="crop-actions"><button type="button" data-crop-use class="bounty-btn">USE IMAGE</button><button type="button" data-crop-cancel class="bounty-btn secondary">CANCEL</button></div>';
  document.body.append(dialog);
  try {
    const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('The image could not be opened.')); img.src = url; });
    const position = () => Object.fromEntries([...dialog.querySelectorAll('input')].map(i => [i.name, Number(i.value)]));
    const draw = () => { const p = position(), crop = Math.min(image.naturalWidth, image.naturalHeight) / p.zoom; dialog.querySelector('canvas').getContext('2d').drawImage(image, (image.naturalWidth - crop) * p.x / 100, (image.naturalHeight - crop) * p.y / 100, crop, crop, 0, 0, 256, 256); };
    draw(); dialog.addEventListener('input', draw); dialog.showModal();
    const accepted = await new Promise(resolve => { dialog.querySelector('[data-crop-use]').onclick = () => resolve(true); dialog.querySelector('[data-crop-cancel]').onclick = () => resolve(false); dialog.addEventListener('cancel', () => resolve(false), { once: true }); });
    if (!accepted) return null;
    return await makeProfileIcon(file, position());
  } finally { dialog.close(); dialog.remove(); URL.revokeObjectURL(url); }
}
export { safeProfileImage, makeProfileIcon, cropProfileIcon };
