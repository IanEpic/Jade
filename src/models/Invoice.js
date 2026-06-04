import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Invoice extends Model {}

Invoice.init(
  {
    invoiceid:            { type: DataTypes.INTEGER,      primaryKey: true, autoIncrement: true },
    userid:               { type: DataTypes.INTEGER },
    invoicee:             { type: DataTypes.STRING },
    postaladdressid:      { type: DataTypes.INTEGER },
    email:                { type: DataTypes.STRING },
    date:                 { type: DataTypes.DATE },
    totalex:              { type: DataTypes.DECIMAL(19,4) },
    gst:                  { type: DataTypes.DECIMAL(19,4) },
    ebdiscount:           { type: DataTypes.DECIMAL(19,4) },
    partnerdiscount:      { type: DataTypes.DECIMAL(19,4) },
    multientryadjustment: { type: DataTypes.DECIMAL(19,4) },
    promocode:            { type: DataTypes.STRING },
    deleted:              { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { sequelize, modelName: 'Invoice', tableName: 'Invoice', timestamps: false }
);

export default Invoice;
