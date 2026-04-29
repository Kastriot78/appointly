const Category = require("../models/Category");
const { slugify } = require("../utils/slugify");
const { ICON_KEYS } = require("../constants/categoryIcons");

async function listCategories(_req, res) {
  const categories = await Category.find()
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  res.json({
    categories: categories.map((c) => ({
      id: c._id.toString(),
      slug: c.slug,
      name: c.name,
      iconKey: c.iconKey,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}

async function createCategory(req, res) {
  const { name, slug: slugIn, iconKey, sortOrder } = req.body;
  const n = String(name || "").trim();
  if (!n) {
    return res.status(400).json({ message: "Name is required" });
  }
  const slug = slugIn ? slugify(slugIn) : slugify(n);
  const icon =
    iconKey && ICON_KEYS.includes(iconKey) ? iconKey : "other";
  const order =
    typeof sortOrder === "number" && Number.isFinite(sortOrder)
      ? sortOrder
      : 0;

  const doc = await Category.create({
    slug,
    name: n,
    iconKey: icon,
    sortOrder: order,
  });
  return res.status(201).json({ category: doc.toJSON() });
}

async function updateCategory(req, res) {
  const { id } = req.params;
  const { name, slug: slugIn, iconKey, sortOrder } = req.body;

  const doc = await Category.findById(id);
  if (!doc) {
    return res.status(404).json({ message: "Category not found" });
  }

  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) {
      return res.status(400).json({ message: "Name cannot be empty" });
    }
    doc.name = n;
  }
  if (slugIn !== undefined) {
    doc.slug = slugify(slugIn);
  }
  if (iconKey !== undefined) {
    if (!ICON_KEYS.includes(iconKey)) {
      return res.status(400).json({
        message: `iconKey must be one of: ${ICON_KEYS.join(", ")}`,
      });
    }
    doc.iconKey = iconKey;
  }
  if (sortOrder !== undefined) {
    const o = Number(sortOrder);
    if (!Number.isFinite(o)) {
      return res.status(400).json({ message: "sortOrder must be a number" });
    }
    doc.sortOrder = o;
  }

  await doc.save();
  return res.json({ category: doc.toJSON() });
}

async function deleteCategory(req, res) {
  const { id } = req.params;
  const doc = await Category.findByIdAndDelete(id);
  if (!doc) {
    return res.status(404).json({ message: "Category not found" });
  }
  return res.json({ ok: true });
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
};
