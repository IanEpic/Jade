import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

// TODO: replace stub columns with full definition from EPIC::JADE::TravelPackage Perl model
class TravelPackage extends Model {}

TravelPackage.init(
  {
    travelpackageid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entryid:         { type: DataTypes.INTEGER },
    costex:          { type: DataTypes.DECIMAL(19,4) },
    gst:             { type: DataTypes.DECIMAL(19,4) },
    invoiceid:       { type: DataTypes.INTEGER },
    paid:            { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'TravelPackage',
    tableName: 'TravelPackage',
    timestamps: false,
  }
);

export default TravelPackage;
