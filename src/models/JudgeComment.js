import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class JudgeComment extends Model {}

JudgeComment.init(
  {
    commentid:   { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entryid:     { type: DataTypes.INTEGER },
    userid:      { type: DataTypes.INTEGER },
    type:        { type: DataTypes.STRING },
    comment:     { type: DataTypes.TEXT },
    deleted:     { type: DataTypes.BOOLEAN, defaultValue: false },
    simplescore: { type: DataTypes.INTEGER },
    reviewrequested: { type: DataTypes.BOOLEAN, defaultValue: false },
    reviewreason:    { type: DataTypes.STRING },
    reviewchecked:   { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'JudgeComment',
    tableName: 'JudgeComment',
    timestamps: false,
  }
);

export default JudgeComment;
