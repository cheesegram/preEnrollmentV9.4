export function getCapacityState(count, capacity) {
  const currentCount = Number(count ?? 0);
  const cap = Number(capacity ?? 0);

  if (currentCount < cap) return "available";
  if (currentCount === cap) return "full";
  return "overloaded";
}

export function getCapacityStateStyle(count, capacity) {
  const state = getCapacityState(count, capacity);
  if (state === "available") return "bg-green-100 text-green-700 font-bold";
  if (state === "full") return "bg-blue-100 text-blue-700 font-bold";
  return "bg-red-100 text-red-700 font-bold";
}

export function getSectionStatus(blockCount, blockCapacity, irregularCount, irregularCapacity) {
  const blockState = getCapacityState(blockCount, blockCapacity);
  const irregularState = getCapacityState(irregularCount, irregularCapacity);

  if (blockState === "available" && irregularState === "available") return "Available";
  if (blockState === "available" && irregularState === "full") return "Block Available | Irreg Full";
  if (blockState === "available" && irregularState === "overloaded") return "Block Available | Irreg Overloaded";
  if (blockState === "full" && irregularState === "available") return "Block Full | Irreg Available";
  if (blockState === "full" && irregularState === "full") return "Full";
  if (blockState === "full" && irregularState === "overloaded") return "Block Full | Irreg Overloaded";
  if (blockState === "overloaded" && irregularState === "available") return "Block Overloaded | Irreg Available";
  if (blockState === "overloaded" && irregularState === "full") return "Block Overloaded | Irreg Full";
  return "Block Overloaded | Irreg Overloaded";
}

export function getOverallStatus(blockCount, blockCapacity, irregularCount, irregularCapacity) {
  const blockState = getCapacityState(blockCount, blockCapacity);
  const irregularState = getCapacityState(irregularCount, irregularCapacity);

  if (blockState === "available" && irregularState === "available") return "Available";
  if (blockState === "full" && irregularState === "full") return "Full";
  return "Overloaded";
}
