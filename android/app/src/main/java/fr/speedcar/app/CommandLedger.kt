package fr.speedcar.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject

class CommandLedger(context: Context) : SQLiteOpenHelper(context, "commands.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE receipts(id TEXT PRIMARY KEY, created INTEGER NOT NULL, result TEXT, acknowledged INTEGER NOT NULL DEFAULT 0)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}
    @Synchronized fun existing(id: String): JSONObject? {
        readableDatabase.query("receipts", arrayOf("result"), "id=?", arrayOf(id), null, null, null).use { c ->
            if (!c.moveToFirst()) return null
            if (!c.isNull(0)) return JSONObject(c.getString(0))
            return JSONObject().put("status", "indeterminate").put("command_id", id)
                .put("note", "Une exécution a pu commencer. Elle ne sera pas répétée automatiquement.")
        }
    }
    @Synchronized fun claim(id: String): Boolean {
        val values = ContentValues().apply { put("id", id); put("created", System.currentTimeMillis()) }
        return writableDatabase.insertWithOnConflict("receipts", null, values, SQLiteDatabase.CONFLICT_IGNORE) != -1L
    }
    @Synchronized fun complete(id: String, result: JSONObject) {
        writableDatabase.update("receipts", ContentValues().apply { put("result", result.toString()); put("acknowledged", 0) }, "id=?", arrayOf(id))
        writableDatabase.execSQL("DELETE FROM receipts WHERE created < ?", arrayOf(System.currentTimeMillis() - 86_400_000))
        writableDatabase.execSQL("DELETE FROM receipts WHERE id IN (SELECT id FROM receipts ORDER BY created DESC LIMIT -1 OFFSET 200)")
    }
    @Synchronized fun acknowledge(id: String) {
        writableDatabase.update("receipts", ContentValues().apply { put("acknowledged", 1) }, "id=? AND result IS NOT NULL", arrayOf(id))
    }
    @Synchronized fun outbox(): List<Pair<String, JSONObject>> {
        val values = mutableListOf<Pair<String, JSONObject>>()
        readableDatabase.query("receipts", arrayOf("id", "result"), "acknowledged=0 AND result IS NOT NULL", null, null, null, "created ASC", "200").use { c ->
            while (c.moveToNext()) values.add(c.getString(0) to JSONObject(c.getString(1)))
        }
        return values
    }
}
