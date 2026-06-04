import { DataTypes, Model } from 'sequelize';

import sequelize from '../config/sequelize.js';

class JudgeEntryLinkWildcardNomination extends Model {}

JudgeEntryLinkWildcardNomination.init(
  {
    linkid:  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userid:  { type: DataTypes.INTEGER },
    entryid: { type: DataTypes.INTEGER },
    reason:  { type: DataTypes.TEXT },
  },
  {
    sequelize,
    modelName: 'JudgeEntryLinkWildcardNomination',
    tableName: 'JudgeEntryLinkWildcardNomination',
    timestamps: false,
  }
);

export default JudgeEntryLinkWildcardNomination;
