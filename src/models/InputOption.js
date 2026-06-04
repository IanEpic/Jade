import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class InputOption extends Model {}

InputOption.init(
  {
    inputoptionid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    questionid:    { type: DataTypes.INTEGER },
    name:          { type: DataTypes.STRING },
    orda:          { type: DataTypes.FLOAT },
    deleted:       { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'InputOption',
    tableName: 'InputOption',
    timestamps: false,
  }
);

export default InputOption;
