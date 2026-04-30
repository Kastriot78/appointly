const mongoose = require("mongoose");
const Location = require("../models/Location");

async function listLocations(_req, res) {
  const locations = await Location.find()
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  res.json({
    locations: locations.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}

async function createLocation(req, res) {
  const { name, sortOrder } = req.body;
  const n = String(name || "").trim();
  if (!n) {
    return res.status(400).json({ message: "Name is required" });
  }
  const order =
    typeof sortOrder === "number" && Number.isFinite(sortOrder)
      ? sortOrder
      : 0;

  const doc = await Location.create({
    name: n,
    sortOrder: order,
  });
  return res.status(201).json({ location: doc.toJSON() });
}

async function updateLocation(req, res) {
  const { id } = req.params;
  const { name, sortOrder } = req.body;

  const doc = await Location.findById(id);
  if (!doc) {
    return res.status(404).json({ message: "Location not found" });
  }

  if (name !== undefined) {
    const n = String(name).trim();
    if (!n) {
      return res.status(400).json({ message: "Name cannot be empty" });
    }
    doc.name = n;
  }
  if (sortOrder !== undefined) {
    const o = Number(sortOrder);
    if (!Number.isFinite(o)) {
      return res.status(400).json({ message: "sortOrder must be a number" });
    }
    doc.sortOrder = o;
  }

  await doc.save();
  return res.json({ location: doc.toJSON() });
}

async function deleteLocation(req, res) {
  const { id } = req.params;
  const doc = await Location.findByIdAndDelete(id);
  if (!doc) {
    return res.status(404).json({ message: "Location not found" });
  }
  return res.json({ ok: true });
}

async function reorderLocations(req, res) {
  const ids = Array.isArray(req.body?.orderedLocationIds)
    ? req.body.orderedLocationIds.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  if (ids.length === 0) {
    return res.status(400).json({ message: "orderedLocationIds is required" });
  }
  if (!ids.every((id) => mongoose.isValidObjectId(id))) {
    return res
      .status(400)
      .json({ message: "orderedLocationIds contains invalid id" });
  }
  if (new Set(ids).size !== ids.length) {
    return res
      .status(400)
      .json({ message: "orderedLocationIds must not contain duplicates" });
  }

  const rows = await Location.find({}, "_id").lean();
  const existingIds = rows.map((r) => String(r._id));
  if (existingIds.length !== ids.length) {
    return res.status(400).json({
      message:
        "orderedLocationIds must contain every location id exactly once",
    });
  }
  const existingSet = new Set(existingIds);
  if (!ids.every((id) => existingSet.has(id))) {
    return res.status(400).json({
      message:
        "orderedLocationIds must contain every location id exactly once",
    });
  }

  const ops = ids.map((id, idx) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { sortOrder: idx } },
    },
  }));
  if (ops.length > 0) {
    await Location.bulkWrite(ops, { ordered: true });
  }

  const locations = await Location.find()
    .sort({ sortOrder: 1, name: 1 })
    .lean();
  return res.json({
    locations: locations.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}

module.exports = {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  reorderLocations,
};
