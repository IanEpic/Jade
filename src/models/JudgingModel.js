import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class JudgingModel extends Model {}

JudgingModel.init(
  {
    judgingmodelid:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    scorebasis:        { type: DataTypes.STRING },
    minscore:          { type: DataTypes.FLOAT },
    maxscore:          { type: DataTypes.FLOAT },
    scoreincrement:    { type: DataTypes.FLOAT },
    nullscoreallowed:  { type: DataTypes.BOOLEAN },
    nullscorelabel:    { type: DataTypes.STRING },
    nullscorevalue:    { type: DataTypes.FLOAT },
    judgeinstructions: { type: DataTypes.TEXT },
    commentsallowed:   { type: DataTypes.BOOLEAN },
    commentsrequired:    { type: DataTypes.BOOLEAN },
    submitbuttonlabel:   { type: DataTypes.STRING },
    commentguidelines:   { type: DataTypes.TEXT },
  },
  {
    sequelize,
    modelName: 'JudgingModel',
    tableName: 'JudgingModel',
    timestamps: false,
  }
);

export default JudgingModel;
