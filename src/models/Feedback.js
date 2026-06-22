import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Feedback extends Model {}

Feedback.init(
  {
    feedbackid:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userid:        { type: DataTypes.INTEGER },
    communication: { type: DataTypes.STRING },
    portal:        { type: DataTypes.STRING },
    judges:        { type: DataTypes.STRING },
    overall:       { type: DataTypes.STRING },
    categories:    { type: DataTypes.TEXT },
    entry_process: { type: DataTypes.TEXT },
    enter_again:   { type: DataTypes.TEXT },
    improve:       { type: DataTypes.TEXT },
    testimonial:   { type: DataTypes.TEXT },
  },
  {
    sequelize,
    modelName: 'Feedback',
    tableName: 'Feedback',
    timestamps: false,
  }
);

export default Feedback;
