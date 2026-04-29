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

module.exports = {
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
};
