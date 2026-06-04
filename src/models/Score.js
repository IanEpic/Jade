import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Score extends Model {}

Score.init(
  {
    scoreid:    { type: DataTypes.INTEGER,       primaryKey: true, autoIncrement: true },
    entryid:    { type: DataTypes.INTEGER },
    criteriaid: { type: DataTypes.INTEGER },
    userid:     { type: DataTypes.INTEGER },
    score:      { type: DataTypes.DECIMAL(10, 2) },
    deleted:    { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'Score',
    tableName: 'Score',
    timestamps: false,
  }
);

export default Score;
