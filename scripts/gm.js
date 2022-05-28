const baseUrl = 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/';
const urls = {
	timestamp: baseUrl + 'timestamp.txt',
	gm: baseUrl + 'latest.json',
};

const getTimestamp = async function () {
	const db = await openDB();
	return getDB(db, 'timestamp');
};

async function fetchText(url) {
	const response = await fetch(url);
	return response.text();
}

function handleDbError(event) {
	console.error(event);
}

async function getCachedGm(db) {
	return JSON.parse(await getDB(db, 'gm'));
}

/**
* @param {Object} options
* @param {*} options.cache If truthy, return cached game master and do not check for updates.
* @returns {Promise<Array>} game master. Format is like Poke Miner but with the redundant
*   outer templateId+data container stripped.
*/
const updateGm = async function (options) {
	const db = await openDB();

	if (options?.cache) {
		return getCachedGm(db);
	}

	const timestamp = await fetchText(urls.timestamp);
	const cachedTimestamp = await getDB(db, 'timestamp');
	if (timestamp === cachedTimestamp) {
		return getCachedGm(db);
	} else {
		const gm = stripRedundantWrapper(JSON.parse(await fetchText(urls.gm)));
		const kv = db.transaction('kv', 'readwrite').objectStore('kv');
		kv.put(JSON.stringify(gm), 'gm');
		kv.put(timestamp, 'timestamp');
		return gm;
	}
};

function openDB() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('pogojs');
		request.addEventListener('upgradeneeded', event => {
			const db = event.target.result;
			db.createObjectStore('kv');
		});
		request.addEventListener('success', event => {
			const db = event.target.result;
			db.addEventListener('error', handleDbError);
			resolve(db);
		});
		request.addEventListener('error', event => {
			reject(event.target.error);
		});
	});
}

function getDB(db, key) {
	return new Promise(function (resolve, reject) {
		const request = db.transaction('kv').objectStore('kv').get(key);
		request.addEventListener('success', event => {
			resolve(event.target.result);
		});
		request.addEventListener('error', event => {
			reject(event.target.error);
		});
	})
}

/**
* Pokeminer format: Array of objects where each object is
* ```
* {                       // redundant container
*   "templateId": "...",  // duplicated below
*   "data": {             // keep this object value
*     "templateId": "...",
*     "<dataName>": {}
*   }
* }
* ```
*
* Removing the redundant templateId and data wrappers saves about 500 kB in
* storage.
* @param {Array} rawGm
* @returns
*/
const stripRedundantWrapper = function (rawGm) {
	console.assert(Array.isArray(rawGm), rawGm);
	return rawGm.map(item => {
		console.assert(typeof item === 'object' && 'templateId' in item && 'data' in item, item);
		console.assert(item.templateId === item.data.templateId, item);
		return item.data;
	});
};


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
* @param {Object} gameData
* @returns {Set} of move uniqueId's
*/
const getAllTeachableMoves = function (gameData) {
	const moves = new Set();
	for (const {pokemonSettings} of gameData) {
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
};

const getSeasonDescription = function (timestamps) {
	const now = Date.now();
	const seasonIndex = timestamps.findIndex(x => x > now);
	if (seasonIndex === 12) return 'Interlude';
	return String(seasonIndex - 2);
};

export {updateGm, getTimestamp, groupGmByDataType, getAllTeachableMoves, getSeasonDescription};
