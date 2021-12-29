/**
 * Sort Map by keys
 * @param {Map} map to sort
 * @param {Function} compare see Array.sort 
 * @returns {Map} new Map with same contents but with keys sorted
 */
function sortMapByKeys(map, compare) {
  const sortedMap = new Map();
  const sortedKeys = [...map.keys()].sort(compare);
  for (const key of sortedKeys) {
    sortedMap.set(key, map.get(key));
  }
  return sortedMap;
}

function numericCompare(a, b) { return a - b; }
function descendingNumericCompare(a, b) { return b - a; }

function toLocaleFixed(number, digits, locales) {
  return number.toLocaleString(locales, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function removeAllChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export { sortMapByKeys, numericCompare, descendingNumericCompare, toLocaleFixed, removeAllChildren };