const urls = {
  timestamp: 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/timestamp.txt',
  gm: 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json'
}

async function getTimestamp() {
  const db = await openDB();
  return getDB(db, 'timestamp');
}

async function updateGm(options) {
  const db = await openDB();
  
  if (options?.cache) {
    return JSON.parse(await getDB(db, 'gm'));
  }
  
  let response;
  response = await fetch(urls.timestamp);
  const timestamp = await response.text();
  
  const cachedTimestamp = await getDB(db, 'timestamp');

  if (timestamp === cachedTimestamp) {
    return JSON.parse(await getDB(db, 'gm'));
  } else {
    response = await fetch(urls.gm);
    const gm = processRawGm(await response.text());
    putDB(db, JSON.stringify(gm), 'gm');
    putDB(db, timestamp, 'timestamp');
    // not waiting for the preceding puts
    return gm;
  }
}

function openDB() {
  return new Promise(function(resolve, reject) {
    const request = indexedDB.open('pogojs');
    request.addEventListener('upgradeneeded', function(event) {
      const db = event.target.result;
      db.createObjectStore('kv');
    });
    request.addEventListener('success', function(event) {
      resolve(event.target.result);
    });
    request.addEventListener('error', function(event) {
      reject(event.target.error);
    });
  });
}

function getDB(db, key) {
  return new Promise(function (resolve, reject) {
    const request = db.transaction('kv').objectStore('kv').get(key);
    request.addEventListener('success', function(event) {
      resolve(event.target.result);
    });
    request.addEventListener('error', function(event) {
      reject(event.target.error);
    });
  })
}

function putDB(db, value, key) {
  return new Promise(function (resolve, reject) {
    const request = db.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
    request.addEventListener('success', function(event) {
      resolve(event.target.result);
    });
    request.addEventListener('error', function(event) {
      reject(event.target.error);
    });
  });
}

/*
  Pokeminer format:
  [
   {                      // strip redundant container
     "templateId": "...",
     "data": {            // keep this object
       "templateId": "...",
       "...": {}
     }
   }
  ]
 */
function processRawGm(rawText) {
  const preGm = JSON.parse(rawText);
  console.assert(Array.isArray(preGm), preGm);
  return preGm.map(function(item) {
    console.assert(typeof item === 'object' && 'templateId' in item && 'data' in item, item);
    console.assert(item.templateId === item.data.templateId, item);
    return item.data;
  });
}

function groupGmByDataType(gm) {
  const newGm = new Map();
  for (const item of gm) {
    const keys = Object.keys(item);
    console.assert(keys.length === 2, keys);
    let dataName;
    for (const key of keys) {
      if (key === 'templateId') continue;
      dataName = key;
    }
    const bucket = newGm.get(dataName) ?? [];
    bucket.push(item);
    newGm.set(dataName, bucket);
  }
  return newGm;
}

/**
 * Get set of all moves that can be taught by TM or elite TM.
 * Caution! This does NOT cover every possible move that is usable
 * in game. Moves not covered include:
 *  - Frustration, Return (shadow/purified exclusives)
 *  - Smeargle moves
 *  - True legacy (e.g. pre 2016 move rework)
 *  - Techno Blast (not in move pool for some reason)
 *  - short window before a new CD move is added to move pool
 * 
 * @param {Array} gm 
 * @returns {Set} of move uniqueId's
 */
function getAllTeachableMoves(gm) {
  const moves = new Set();
  for (const { pokemonSettings } of gm) {
    if (pokemonSettings === undefined) continue;

    for (const moveList of [
        'quickMoves', 
        'cinematicMoves', 
        'eliteQuickMove', 
        'eliteCinematicMove'
    ]) {
      if (!(moveList in pokemonSettings)) continue;

      for (const move of pokemonSettings[moveList]) moves.add(move);
    }
  }
  return moves;
}

export { updateGm, getTimestamp, groupGmByDataType, getAllTeachableMoves };
