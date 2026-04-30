const { v2: cloudinary } = require("cloudinary");

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

function ensureCloudinaryConfigured() {
  if (!hasCloudinaryConfig()) {
    const err = new Error(
      "Image storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
    err.statusCode = 500;
    throw err;
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

async function uploadImageFile(file, folder) {
  ensureCloudinaryConfigured();
  if (!file) {
    const err = new Error("No image file was provided");
    err.statusCode = 400;
    throw err;
  }

  if (file.path) {
    const out = await cloudinary.uploader.upload(file.path, {
      folder,
      resource_type: "image",
    });
    return out.secure_url;
  }

  if (!file.buffer) {
    const err = new Error("Uploaded image has no readable file content");
    err.statusCode = 400;
    throw err;
  }

  const out = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
    stream.end(file.buffer);
  });
  return out.secure_url;
}

module.exports = {
  hasCloudinaryConfig,
  uploadImageFile,
};
