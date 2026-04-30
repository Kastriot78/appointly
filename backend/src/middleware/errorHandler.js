function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  console.error(err);

  if (err.name === "MulterError") {
    const msg =
      err.code === "LIMIT_FILE_SIZE"
        ? "Image must be 5MB or smaller"
        : err.message || "File upload error";
    return res.status(400).json({ message: msg });
  }

  if (err.code === 11000 && err.keyPattern?.email) {
    return res.status(409).json({ message: "Email already registered" });
  }

  if (err.code === 11000 && err.keyPattern?.slug) {
    return res
      .status(409)
      .json({ message: "This slug is already in use. Choose another." });
  }

  if (err.code === 11000 && err.keyPattern?.name) {
    return res
      .status(409)
      .json({ message: "This name is already in use. Choose another." });
  }

  const status = err.statusCode || err.status || 500;
  const isDev = process.env.NODE_ENV !== "production";
  const isCreateBusinessRoute =
    req?.method === "POST" &&
    String(req?.originalUrl || "").startsWith("/api/businesses");
  const exposeDetails =
    isDev ||
    isCreateBusinessRoute ||
    String(process.env.EXPOSE_ERROR_DETAILS || "").toLowerCase() === "true";

  let message =
    status === 500 ? "Something went wrong" : err.message || "Request failed";

  if (status === 500 && isDev && err.message) {
    message = err.message;
  }

  const body = { message };
  if (status === 500 && exposeDetails && err.message) {
    body.details = err.message;
    if (isCreateBusinessRoute) {
      body.hint =
        "Business creation failed on server. If request includes images, retry without images or use external storage (Cloudinary/S3) on Vercel.";
    }
  }
  if (err.extra && typeof err.extra === "object") {
    Object.assign(body, err.extra);
  }
  if (isDev && status === 500 && err.stack) {
    body.stack = err.stack;
  }

  res.status(status).json(body);
}

module.exports = errorHandler;
