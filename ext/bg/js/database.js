/*
 * Copyright (C) 2016-2020  Yomichan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* global
 * dictFieldSplit
 */

class Database {
    constructor() {
        this.db = null;
        this._schemas = new Map();
    }

    // Public

    async prepare() {
        if (this.db !== null) {
            throw new Error('Database already initialized');
        }

        try {
            this.db = await Database._open('dict', 6, (db, transaction, oldVersion) => {
                Database._upgrade(db, transaction, oldVersion, [
                    {
                        version: 2,
                        stores: {
                            terms: {
                                primaryKey: {keyPath: 'id', autoIncrement: true},
                                indices: ['dictionary', 'expression', 'reading']
                            },
                            kanji: {
                                primaryKey: {autoIncrement: true},
                                indices: ['dictionary', 'character']
                            },
                            tagMeta: {
                                primaryKey: {autoIncrement: true},
                                indices: ['dictionary']
                            },
                            dictionaries: {
                                primaryKey: {autoIncrement: true},
                                indices: ['title', 'version']
                            }
                        }
                    },
                    {
                        version: 3,
                        stores: {
                            termMeta: {
                                primaryKey: {autoIncrement: true},
                                indices: ['dictionary', 'expression']
                            },
                            kanjiMeta: {
                                primaryKey: {autoIncrement: true},
                                indices: ['dictionary', 'character']
                            },
                            tagMeta: {
                                primaryKey: {autoIncrement: true},
                                indices: ['dictionary', 'name']
                            }
                        }
                    },
                    {
                        version: 4,
                        stores: {
                            terms: {
                                primaryKey: {keyPath: 'id', autoIncrement: true},
                                indices: ['dictionary', 'expression', 'reading', 'sequence']
                            }
                        }
                    },
                    {
                        version: 5,
                        stores: {
                            terms: {
                                primaryKey: {keyPath: 'id', autoIncrement: true},
                                indices: ['dictionary', 'expression', 'reading', 'sequence', 'expressionReverse', 'readingReverse']
                            }
                        }
                    },
                    {
                        version: 6,
                        stores: {
                            media: {
                                primaryKey: {keyPath: 'id', autoIncrement: true},
                                indices: ['dictionary', 'path']
                            }
                        }
                    }
                ]);
            });
            return true;
        } catch (e) {
            yomichan.logError(e);
            return false;
        }
    }

    async close() {
        this._validate();
        this.db.close();
        this.db = null;
    }

    isPrepared() {
        return this.db !== null;
    }

    async purge() {
        this._validate();

        this.db.close();
        await Database._deleteDatabase(this.db.name);
        this.db = null;

        await this.prepare();
    }

    async deleteDictionary(dictionaryName, progressSettings, onProgress) {
        this._validate();

        const targets = [
            ['dictionaries', 'title'],
            ['kanji', 'dictionary'],
            ['kanjiMeta', 'dictionary'],
            ['terms', 'dictionary'],
            ['termMeta', 'dictionary'],
            ['tagMeta', 'dictionary']
        ];
        const promises = [];
        const progressData = {
            count: 0,
            processed: 0,
            storeCount: targets.length,
            storesProcesed: 0
        };
        let progressRate = (typeof progressSettings === 'object' && progressSettings !== null ? progressSettings.rate : 0);
        if (typeof progressRate !== 'number' || progressRate <= 0) {
            progressRate = 1000;
        }

        for (const [objectStoreName, index] of targets) {
            const dbTransaction = this.db.transaction([objectStoreName], 'readwrite');
            const dbObjectStore = dbTransaction.objectStore(objectStoreName);
            const dbIndex = dbObjectStore.index(index);
            const only = IDBKeyRange.only(dictionaryName);
            promises.push(Database._deleteValues(dbObjectStore, dbIndex, only, onProgress, progressData, progressRate));
        }

        await Promise.all(promises);
    }

    async findTermsBulk(termList, dictionaries, wildcard) {
        this._validate();

        const promises = [];
        const visited = new Set();
        const results = [];
        const processRow = (row, index) => {
            if (dictionaries.has(row.dictionary) && !visited.has(row.id)) {
                visited.add(row.id);
                results.push(Database._createTerm(row, index));
            }
        };

        const useWildcard = !!wildcard;
        const prefixWildcard = wildcard === 'prefix';

        const dbTransaction = this.db.transaction(['terms'], 'readonly');
        const dbTerms = dbTransaction.objectStore('terms');
        const dbIndex1 = dbTerms.index(prefixWildcard ? 'expressionReverse' : 'expression');
        const dbIndex2 = dbTerms.index(prefixWildcard ? 'readingReverse' : 'reading');

        for (let i = 0; i < termList.length; ++i) {
            const term = prefixWildcard ? stringReverse(termList[i]) : termList[i];
            const query = useWildcard ? IDBKeyRange.bound(term, `${term}\uffff`, false, false) : IDBKeyRange.only(term);
            promises.push(
                Database._getAll(dbIndex1, query, i, processRow),
                Database._getAll(dbIndex2, query, i, processRow)
            );
        }

        await Promise.all(promises);

        return results;
    }

    async findTermsExactBulk(termList, readingList, dictionaries) {
        this._validate();

        const promises = [];
        const results = [];
        const processRow = (row, index) => {
            if (row.reading === readingList[index] && dictionaries.has(row.dictionary)) {
                results.push(Database._createTerm(row, index));
            }
        };

        const dbTransaction = this.db.transaction(['terms'], 'readonly');
        const dbTerms = dbTransaction.objectStore('terms');
        const dbIndex = dbTerms.index('expression');

        for (let i = 0; i < termList.length; ++i) {
            const only = IDBKeyRange.only(termList[i]);
            promises.push(Database._getAll(dbIndex, only, i, processRow));
        }

        await Promise.all(promises);

        return results;
    }

    async findTermsBySequenceBulk(sequenceList, mainDictionary) {
        this._validate();

        const promises = [];
        const results = [];
        const processRow = (row, index) => {
            if (row.dictionary === mainDictionary) {
                results.push(Database._createTerm(row, index));
            }
        };

        const dbTransaction = this.db.transaction(['terms'], 'readonly');
        const dbTerms = dbTransaction.objectStore('terms');
        const dbIndex = dbTerms.index('sequence');

        for (let i = 0; i < sequenceList.length; ++i) {
            const only = IDBKeyRange.only(sequenceList[i]);
            promises.push(Database._getAll(dbIndex, only, i, processRow));
        }

        await Promise.all(promises);

        return results;
    }

    async findTermMetaBulk(termList, dictionaries) {
        return this._findGenericBulk('termMeta', 'expression', termList, dictionaries, Database._createTermMeta);
    }

    async findKanjiBulk(kanjiList, dictionaries) {
        return this._findGenericBulk('kanji', 'character', kanjiList, dictionaries, Database._createKanji);
    }

    async findKanjiMetaBulk(kanjiList, dictionaries) {
        return this._findGenericBulk('kanjiMeta', 'character', kanjiList, dictionaries, Database._createKanjiMeta);
    }

    async findTagForTitle(name, title) {
        this._validate();

        let result = null;
        const dbTransaction = this.db.transaction(['tagMeta'], 'readonly');
        const dbTerms = dbTransaction.objectStore('tagMeta');
        const dbIndex = dbTerms.index('name');
        const only = IDBKeyRange.only(name);
        await Database._getAll(dbIndex, only, null, (row) => {
            if (title === row.dictionary) {
                result = row;
            }
        });

        return result;
    }

    async getMedia(targets) {
        this._validate();

        const count = targets.length;
        const promises = [];
        const results = new Array(count).fill(null);
        const createResult = Database._createMedia;
        const processRow = (row, [index, dictionaryName]) => {
            if (row.dictionary === dictionaryName) {
                results[index] = createResult(row, index);
            }
        };

        const transaction = this.db.transaction(['media'], 'readonly');
        const objectStore = transaction.objectStore('media');
        const index = objectStore.index('path');

        for (let i = 0; i < count; ++i) {
            const {path, dictionaryName} = targets[i];
            const only = IDBKeyRange.only(path);
            promises.push(Database._getAll(index, only, [i, dictionaryName], processRow));
        }

        await Promise.all(promises);

        return results;
    }

    async getDictionaryInfo() {
        this._validate();

        const results = [];
        const dbTransaction = this.db.transaction(['dictionaries'], 'readonly');
        const dbDictionaries = dbTransaction.objectStore('dictionaries');

        await Database._getAll(dbDictionaries, null, null, (info) => results.push(info));

        return results;
    }

    async getDictionaryCounts(dictionaryNames, getTotal) {
        this._validate();

        const objectStoreNames = [
            'kanji',
            'kanjiMeta',
            'terms',
            'termMeta',
            'tagMeta'
        ];
        const dbCountTransaction = this.db.transaction(objectStoreNames, 'readonly');

        const targets = [];
        for (const objectStoreName of objectStoreNames) {
            targets.push([
                objectStoreName,
                dbCountTransaction.objectStore(objectStoreName).index('dictionary')
            ]);
        }

        // Query is required for Edge, otherwise index.count throws an exception.
        const query1 = IDBKeyRange.lowerBound('', false);
        const totalPromise = getTotal ? Database._getCounts(targets, query1) : null;

        const counts = [];
        const countPromises = [];
        for (let i = 0; i < dictionaryNames.length; ++i) {
            counts.push(null);
            const index = i;
            const query2 = IDBKeyRange.only(dictionaryNames[i]);
            const countPromise = Database._getCounts(targets, query2).then((v) => counts[index] = v);
            countPromises.push(countPromise);
        }
        await Promise.all(countPromises);

        const result = {counts};
        if (totalPromise !== null) {
            result.total = await totalPromise;
        }
        return result;
    }

    async dictionaryExists(title) {
        this._validate();
        const transaction = this.db.transaction(['dictionaries'], 'readonly');
        const index = transaction.objectStore('dictionaries').index('title');
        const query = IDBKeyRange.only(title);
        const count = await Database._getCount(index, query);
        return count > 0;
    }

    bulkAdd(objectStoreName, items, start, count) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([objectStoreName], 'readwrite');
            const objectStore = transaction.objectStore(objectStoreName);

            if (start + count > items.length) {
                count = items.length - start;
            }

            if (count <= 0) {
                resolve();
                return;
            }

            const end = start + count;
            let completedCount = 0;
            const onError = (e) => reject(e);
            const onSuccess = () => {
                if (++completedCount >= count) {
                    resolve();
                }
            };

            for (let i = start; i < end; ++i) {
                const request = objectStore.add(items[i]);
                request.onerror = onError;
                request.onsuccess = onSuccess;
            }
        });
    }

    // Private

    _validate() {
        if (this.db === null) {
            throw new Error('Database not initialized');
        }
    }

    async _findGenericBulk(tableName, indexName, indexValueList, dictionaries, createResult) {
        this._validate();

        const promises = [];
        const results = [];
        const processRow = (row, index) => {
            if (dictionaries.has(row.dictionary)) {
                results.push(createResult(row, index));
            }
        };

        const dbTransaction = this.db.transaction([tableName], 'readonly');
        const dbTerms = dbTransaction.objectStore(tableName);
        const dbIndex = dbTerms.index(indexName);

        for (let i = 0; i < indexValueList.length; ++i) {
            const only = IDBKeyRange.only(indexValueList[i]);
            promises.push(Database._getAll(dbIndex, only, i, processRow));
        }

        await Promise.all(promises);

        return results;
    }

    static _createTerm(row, index) {
        return {
            index,
            expression: row.expression,
            reading: row.reading,
            definitionTags: dictFieldSplit(row.definitionTags || row.tags || ''),
            termTags: dictFieldSplit(row.termTags || ''),
            rules: dictFieldSplit(row.rules),
            glossary: row.glossary,
            score: row.score,
            dictionary: row.dictionary,
            id: row.id,
            sequence: typeof row.sequence === 'undefined' ? -1 : row.sequence
        };
    }

    static _createKanji(row, index) {
        return {
            index,
            character: row.character,
            onyomi: dictFieldSplit(row.onyomi),
            kunyomi: dictFieldSplit(row.kunyomi),
            tags: dictFieldSplit(row.tags),
            glossary: row.meanings,
            stats: row.stats,
            dictionary: row.dictionary
        };
    }

    static _createTermMeta({expression, mode, data, dictionary}, index) {
        return {expression, mode, data, dictionary, index};
    }

    static _createKanjiMeta({character, mode, data, dictionary}, index) {
        return {character, mode, data, dictionary, index};
    }

    static _createMedia(row, index) {
        return Object.assign({}, row, {index});
    }

    static _getAll(dbIndex, query, context, processRow) {
        const fn = typeof dbIndex.getAll === 'function' ? Database._getAllFast : Database._getAllUsingCursor;
        return fn(dbIndex, query, context, processRow);
    }

    static _getAllFast(dbIndex, query, context, processRow) {
        return new Promise((resolve, reject) => {
            const request = dbIndex.getAll(query);
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => {
                for (const row of e.target.result) {
                    processRow(row, context);
                }
                resolve();
            };
        });
    }

    static _getAllUsingCursor(dbIndex, query, context, processRow) {
        return new Promise((resolve, reject) => {
            const request = dbIndex.openCursor(query, 'next');
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    processRow(cursor.value, context);
                    cursor.continue();
                } else {
                    resolve();
                }
            };
        });
    }

    static _getCounts(targets, query) {
        const countPromises = [];
        const counts = {};
        for (const [objectStoreName, index] of targets) {
            const n = objectStoreName;
            const countPromise = Database._getCount(index, query).then((count) => counts[n] = count);
            countPromises.push(countPromise);
        }
        return Promise.all(countPromises).then(() => counts);
    }

    static _getCount(dbIndex, query) {
        return new Promise((resolve, reject) => {
            const request = dbIndex.count(query);
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => resolve(e.target.result);
        });
    }

    static _getAllKeys(dbIndex, query) {
        const fn = typeof dbIndex.getAllKeys === 'function' ? Database._getAllKeysFast : Database._getAllKeysUsingCursor;
        return fn(dbIndex, query);
    }

    static _getAllKeysFast(dbIndex, query) {
        return new Promise((resolve, reject) => {
            const request = dbIndex.getAllKeys(query);
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => resolve(e.target.result);
        });
    }

    static _getAllKeysUsingCursor(dbIndex, query) {
        return new Promise((resolve, reject) => {
            const primaryKeys = [];
            const request = dbIndex.openKeyCursor(query, 'next');
            request.onerror = (e) => reject(e);
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    primaryKeys.push(cursor.primaryKey);
                    cursor.continue();
                } else {
                    resolve(primaryKeys);
                }
            };
        });
    }

    static async _deleteValues(dbObjectStore, dbIndex, query, onProgress, progressData, progressRate) {
        const hasProgress = (typeof onProgress === 'function');
        const count = await Database._getCount(dbIndex, query);
        ++progressData.storesProcesed;
        progressData.count += count;
        if (hasProgress) {
            onProgress(progressData);
        }

        const onValueDeleted = (
            hasProgress ?
            () => {
                const p = ++progressData.processed;
                if ((p % progressRate) === 0 || p === progressData.count) {
                    onProgress(progressData);
                }
            } :
            () => {}
        );

        const promises = [];
        const primaryKeys = await Database._getAllKeys(dbIndex, query);
        for (const key of primaryKeys) {
            const promise = Database._deleteValue(dbObjectStore, key).then(onValueDeleted);
            promises.push(promise);
        }

        await Promise.all(promises);
    }

    static _deleteValue(dbObjectStore, key) {
        return new Promise((resolve, reject) => {
            const request = dbObjectStore.delete(key);
            request.onerror = (e) => reject(e);
            request.onsuccess = () => resolve();
        });
    }

    static _open(name, version, onUpgradeNeeded) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(name, version * 10);

            request.onupgradeneeded = (event) => {
                try {
                    request.transaction.onerror = (e) => reject(e);
                    onUpgradeNeeded(request.result, request.transaction, event.oldVersion / 10, event.newVersion / 10);
                } catch (e) {
                    reject(e);
                }
            };

            request.onerror = (e) => reject(e);
            request.onsuccess = () => resolve(request.result);
        });
    }

    static _upgrade(db, transaction, oldVersion, upgrades) {
        for (const {version, stores} of upgrades) {
            if (oldVersion >= version) { continue; }

            const objectStoreNames = Object.keys(stores);
            for (const objectStoreName of objectStoreNames) {
                const {primaryKey, indices} = stores[objectStoreName];

                const objectStoreNames2 = transaction.objectStoreNames || db.objectStoreNames;
                const objectStore = (
                    Database._listContains(objectStoreNames2, objectStoreName) ?
                    transaction.objectStore(objectStoreName) :
                    db.createObjectStore(objectStoreName, primaryKey)
                );

                for (const indexName of indices) {
                    if (Database._listContains(objectStore.indexNames, indexName)) { continue; }

                    objectStore.createIndex(indexName, indexName, {});
                }
            }
        }
    }

    static _deleteDatabase(dbName) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(dbName);
            request.onerror = (e) => reject(e);
            request.onsuccess = () => resolve();
        });
    }

    static _listContains(list, value) {
        for (let i = 0, ii = list.length; i < ii; ++i) {
            if (list[i] === value) { return true; }
        }
        return false;
    }
}
