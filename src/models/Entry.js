import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

// Equivalent of EPIC::JADE::Entry
// Table name preserves the [Entry] bracket notation — Sequelize quotes it correctly for MSSQL.

class Entry extends Model {}

Entry.init(
    {
        // Essential columns — matches EPIC::JADE::Entry->columns(Essential => ...)
        entryid:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        programid:           { type: DataTypes.INTEGER, allowNull: false },
        entrantid:           { type: DataTypes.INTEGER },
        userid:              { type: DataTypes.INTEGER },
        categoryid:          { type: DataTypes.INTEGER },
        userref:             { type: DataTypes.STRING },
        shortdesc:           { type: DataTypes.TEXT },
        costex:              { type: DataTypes.DECIMAL(10, 2) },
        gst:                 { type: DataTypes.DECIMAL(10, 2) },
        receiptid:           { type: DataTypes.STRING },
        orda:                { type: DataTypes.INTEGER },
        invoiceid:           { type: DataTypes.INTEGER },
        entryaccepted:       { type: DataTypes.BOOLEAN },
        finalist:            { type: DataTypes.BOOLEAN },
        statefinalist:       { type: DataTypes.STRING },
        afecode:             { type: DataTypes.STRING },
        entryopen:           { type: DataTypes.BOOLEAN },
        timestamp:           { type: DataTypes.DATE },
        originalcatid:       { type: DataTypes.INTEGER },
        nominated:           { type: DataTypes.BOOLEAN },
        finalised:           { type: DataTypes.BOOLEAN },
        deleted:             { type: DataTypes.BOOLEAN, defaultValue: false },
        approvedbyreviewer:  { type: DataTypes.BOOLEAN },
        finalisttext:        { type: DataTypes.TEXT },
        citation:            { type: DataTypes.TEXT },
        headlinecitation:    { type: DataTypes.TEXT },
        headlinewinner:      { type: DataTypes.BOOLEAN },
        oliveEventID:        { type: DataTypes.INTEGER },
        tpkid:              { type: DataTypes.INTEGER },
        // set_sql queries reference this column — add it to the model
        belowminscore:       { type: DataTypes.BOOLEAN },
    },
    {
        sequelize,
        modelName: 'Entry',
        tableName: 'Entry',       // [Entry] in MSSQL — Sequelize quotes table names automatically
        timestamps: false,
    }
);

export default Entry;
