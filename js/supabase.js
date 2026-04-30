// =====================================================
// Supabase Client with Firebase-Compatible API
// =====================================================
// This wrapper provides the SAME API as Firebase so that
// existing app.js code works with minimal changes.
// =====================================================

const SUPABASE_URL = 'https://xxcqfqedyymuafqvdtgg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0spsK-3jFJ87kmyCc_SCpQ_7fm7uBN8';

// Initialize Supabase Client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose globally for debugging
window.supabaseClient = supabaseClient;

// =====================================================
// Firebase-Compatible API Wrapper
// =====================================================

// Utility: Convert camelCase to snake_case (RECURSIVE)
function toSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => toSnakeCase(item));
    const result = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
            result[snakeKey] = toSnakeCase(obj[key]);
        }
    }
    return result;
}

// Utility: Convert snake_case to camelCase (RECURSIVE)
function toCamelCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => toCamelCase(item));
    const result = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            result[camelKey] = toCamelCase(obj[key]);
        }
    }
    return result;
}

// ===== COLLECTION REFERENCE (just stores table name) =====
function collection(db, tableName) {
    return { _table: tableName, _type: 'collection' };
}

// ===== DOCUMENT REFERENCE =====
function doc(db, tableName, docId) {
    return { _table: tableName, _id: docId, _type: 'doc' };
}

// ===== QUERY BUILDER =====
function query(collectionRef, ...constraints) {
    return {
        _table: collectionRef._table,
        _constraints: constraints,
        _type: 'query'
    };
}

// ===== WHERE CONSTRAINT =====
function where(field, operator, value) {
    return { _field: field, _op: operator, _value: value, _type: 'where' };
}

// ===== ORDER BY (not fully implemented, Supabase handles differently) =====
function orderBy(field, direction) {
    return { _field: field, _direction: direction, _type: 'orderBy' };
}

// ===== ADD DOCUMENT =====
async function addDoc(collectionRef, data) {
    const snakeData = toSnakeCase(data);
    // Remove ID if present to let Supabase handle auto-gen (UUID)
    delete snakeData.id;

    snakeData.created_at = new Date().toISOString();
    snakeData.updated_at = new Date().toISOString();

    const { data: result, error } = await supabaseClient
        .from(collectionRef._table)
        .insert([snakeData])
        .select()
        .single();

    if (error) {
        console.error('addDoc error:', error);
        throw error;
    }
    return {
        id: result.id,
        ref: { _table: collectionRef._table, _id: result.id, _type: 'doc' }
    };
}

// ===== GET SINGLE DOCUMENT =====
async function getDoc(docRef) {
    const { data, error } = await supabaseClient
        .from(docRef._table)
        .select('*')
        .eq('id', docRef._id)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('getDoc error:', error);
        throw error;
    }

    if (!data) {
        return { exists: () => false, data: () => null, id: null };
    }

    return {
        exists: () => true,
        data: () => toCamelCase(data),
        id: data.id,
        ref: { _table: docRef._table, _id: data.id, _type: 'doc' }
    };
}

// ===== GET MULTIPLE DOCUMENTS =====
async function getDocs(queryOrCollection) {
    let tableName = queryOrCollection._table;
    let constraints = queryOrCollection._constraints || [];

    let query = supabaseClient.from(tableName).select('*');

    // Apply constraints
    for (const c of constraints) {
        if (c._type === 'where') {
            const field = c._field.replace(/([A-Z])/g, '_$1').toLowerCase();
            if (c._op === '==') {
                query = query.eq(field, c._value);
            } else if (c._op === 'in') {
                query = query.in(field, c._value);
            } else if (c._op === 'array-contains') {
                query = query.contains(field, [c._value]);
            }
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error('getDocs error:', error);
        throw error;
    }

    const docs = (data || []).map(row => ({
        id: row.id,
        data: () => toCamelCase(row),
        ref: { _table: tableName, _id: row.id, _type: 'doc' }
    }));

    return {
        empty: docs.length === 0,
        docs: docs,
        forEach: (callback) => docs.forEach(callback),
        size: docs.length
    };
}

// ===== UPDATE DOCUMENT =====
async function updateDoc(docRef, data) {
    const snakeData = toSnakeCase(data);
    snakeData.updated_at = new Date().toISOString();

    const { error } = await supabaseClient
        .from(docRef._table)
        .update(snakeData)
        .eq('id', docRef._id);

    if (error) {
        console.error('updateDoc error:', error);
        throw error;
    }
}

// ===== DELETE DOCUMENT =====
async function deleteDoc(docRef) {
    const { error } = await supabaseClient
        .from(docRef._table)
        .delete()
        .eq('id', docRef._id);

    if (error) {
        console.error('deleteDoc error:', error);
        throw error;
    }
}

// ===== REALTIME SUBSCRIPTION (onSnapshot) =====
// [IMPROVED]: Singleton connection with debouncing to prevent connection leaks
let globalChannel = null;
let activeListeners = [];
let fetchTimeouts = {}; 

function onSnapshot(queryOrCollection, callback) {
    const tableName = queryOrCollection._table;
    const listenerId = Math.random().toString(36).substr(2, 9);

    // Initial fetch
    getDocs(queryOrCollection).then(callback).catch(console.error);

    // Add to active listeners
    activeListeners.push({
        id: listenerId,
        tableName: tableName,
        query: queryOrCollection,
        callback: callback
    });

    // Create a SINGLE global channel if it doesn't exist
    if (!globalChannel) {
        globalChannel = supabaseClient.channel('global_db_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public' },
                (payload) => {
                    const changedTable = payload.table;
                    const affectedListeners = activeListeners.filter(l => l.tableName === changedTable);
                    
                    affectedListeners.forEach((listener) => {
                        // Debounce: Wait 250ms before refetching to bundle rapid changes together
                        if (fetchTimeouts[listener.id]) clearTimeout(fetchTimeouts[listener.id]);
                        
                        fetchTimeouts[listener.id] = setTimeout(async () => {
                            try {
                                const result = await getDocs(listener.query);
                                listener.callback(result);
                            } catch (e) {
                                console.error('onSnapshot refetch error:', e);
                            }
                        }, 250); 
                    });
                }
            )
            .subscribe();
    }

    // Return unsubscribe function
    return () => {
        activeListeners = activeListeners.filter(l => l.id !== listenerId);
        if (fetchTimeouts[listenerId]) {
            clearTimeout(fetchTimeouts[listenerId]);
            delete fetchTimeouts[listenerId];
        }
        
        // Clean up channel only when NO listeners are left
        if (activeListeners.length === 0 && globalChannel) {
            supabaseClient.removeChannel(globalChannel);
            globalChannel = null;
        }
    };
}

// ===== WRITE BATCH (for batch operations) =====
function writeBatch(db) {
    const operations = [];
    return {
        delete: (docRef) => {
            operations.push({ type: 'delete', ref: docRef });
        },
        set: (docRef, data) => {
            // For Supabase, set is often add or update. In app.js contexts, usually add.
            operations.push({ type: 'set', ref: docRef, data: data });
        },
        update: (docRef, data) => {
            operations.push({ type: 'update', ref: docRef, data: data });
        },
        commit: async () => {
            // Execute all batch operations in parallel for better performance
            const promises = operations.map(op => {
                if (op.type === 'delete') {
                    return deleteDoc(op.ref);
                } else if (op.type === 'set') {
                    return addDoc({ _table: op.ref._table }, op.data);
                } else if (op.type === 'update') {
                    return updateDoc(op.ref, op.data);
                }
            });
            await Promise.all(promises);
        }
    };
}

// =====================================================
// EXPOSE AS FIREBASE-COMPATIBLE API
// =====================================================
window.db = { _supabase: true }; // Placeholder for db reference

// ===== RPC FUNCTION CALL =====
async function rpc(functionName, params = {}) {
    const { data, error } = await supabaseClient.rpc(functionName, params);
    if (error) {
        console.error('RPC error:', functionName, error);
        throw error;
    }
    return data;
}

window.firebaseOps = {
    collection,
    doc,
    query,
    where,
    orderBy,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    onSnapshot,
    writeBatch,
    rpc
};

// Signal that database is ready
console.log('Supabase Initialized (Firebase-Compatible Mode)');
window.dispatchEvent(new Event('firebaseReady'));
