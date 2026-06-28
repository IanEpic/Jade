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
    commentexamplesgood: { type: DataTypes.TEXT },
    commentexamplesbad:  { type: DataTypes.TEXT },
    finalisttextrules:   { type: DataTypes.TEXT },
    citationrules:       { type: DataTypes.TEXT },
    // Conflict-of-interest policy (least → most restrictive):
    //   0 No management | 1 Allow+exclude own scores | 2 No judging own entry
    //   3 No judging own category | 4 Judges cannot enter
    judgeconflictmodel:  { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: 'JudgingModel',
    tableName: 'JudgingModel',
    timestamps: false,
  }
);

export default JudgingModel;
