import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class JudgeEntryLink extends Model {}

JudgeEntryLink.init(
  {
    linkid:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userid:        { type: DataTypes.INTEGER },
    entryid:       { type: DataTypes.INTEGER },
    judgingopen:   { type: DataTypes.INTEGER },
    commentreview: { type: DataTypes.INTEGER },
  },
  {
    sequelize,
    modelName: 'JudgeEntryLink',
    tableName: 'JudgeEntryLink',
    timestamps: false,
  }
);

export default JudgeEntryLink;
