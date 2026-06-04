import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class ProgramDiscount extends Model {}

ProgramDiscount.init(
  {
    discountid:  { type: DataTypes.INTEGER,      primaryKey: true, autoIncrement: true },
    programid:   { type: DataTypes.INTEGER,      allowNull: false },
    categoryid:  { type: DataTypes.INTEGER },
    name:        { type: DataTypes.STRING(100) },
    type:        { type: DataTypes.STRING(20),   allowNull: false },  // 'earlybird' | 'code'
    code:        { type: DataTypes.STRING(50) },
    amount:      { type: DataTypes.DECIMAL(10,2), allowNull: false },
    amounttype:  { type: DataTypes.STRING(10),   allowNull: false },  // 'dollars' | 'percent'
    validfrom:   { type: DataTypes.DATE },
    validto:     { type: DataTypes.DATE },
    maxuses:     { type: DataTypes.INTEGER },
    usecount:    { type: DataTypes.INTEGER,      defaultValue: 0 },
    active:      { type: DataTypes.BOOLEAN,      defaultValue: true },
  },
  { sequelize, modelName: 'ProgramDiscount', tableName: 'ProgramDiscount', timestamps: false }
);

export default ProgramDiscount;
