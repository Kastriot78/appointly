const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const authenticate = require("../middleware/authenticate");
const requireAdmin = require("../middleware/requireAdmin");
const categoryController = require("../controllers/category.controller");

const router = express.Router();

router.get("/", asyncHandler(categoryController.listCategories));

router.post(
  "/",
  authenticate,
  requireAdmin,
  asyncHandler(categoryController.createCategory),
);

router.put(
  "/:id",
  authenticate,
  requireAdmin,
  asyncHandler(categoryController.updateCategory),
);

router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  asyncHandler(categoryController.deleteCategory),
);

module.exports = router;
