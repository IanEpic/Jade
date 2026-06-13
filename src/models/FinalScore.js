import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class FinalScore extends Model {}

FinalScore.init(
  {
    finalscoreid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    categoryid:   { type: DataTypes.INTEGER, allowNull: true },
    entryid:      { type: DataTypes.INTEGER, allowNull: true },
    categoryname: { type: DataTypes.STRING,  allowNull: true },
    entrantname:  { type: DataTypes.STRING,  allowNull: true },
    finalscore:   { type: DataTypes.FLOAT,   allowNull: true },
  },
  {
    sequelize,
    modelName: 'FinalScore',
    tableName: 'FinalScore',
    timestamps: false,
  }
);

export default FinalScore;
