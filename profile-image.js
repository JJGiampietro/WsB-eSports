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

async function makeProfileIcon(file) {
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
    const crop = Math.min(image.naturalWidth, image.naturalHeight);
    const startX = Math.max(0, (image.naturalWidth - crop) / 2);
    const startY = Math.max(0, (image.naturalHeight - crop) / 2);
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

export { safeProfileImage, makeProfileIcon };
