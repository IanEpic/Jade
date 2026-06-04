import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class LogOnRecord extends Model {}

LogOnRecord.init(
  {
    userid:    { type: DataTypes.INTEGER },
    timestamp: { type: DataTypes.DATE },
  },
  {
    sequelize,
    modelName: 'LogOnRecord',
    tableName: 'LogOnRecord',
    timestamps: false,
  }
);

export default LogOnRecord;
