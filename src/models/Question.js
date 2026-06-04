import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Question extends Model {}

Question.init(
  {
    questionid:          { type: DataTypes.INTEGER,    primaryKey: true, autoIncrement: true },
    programid:           { type: DataTypes.INTEGER },
    questiontype:        { type: DataTypes.STRING(50) },
    questiontext:        { type: DataTypes.TEXT },
    description:         { type: DataTypes.TEXT },
    tip:                 { type: DataTypes.STRING },
    inputtype:           { type: DataTypes.STRING },
    inputwidth:          { type: DataTypes.STRING },
    inputheight:         { type: DataTypes.STRING },
    maxsize:             { type: DataTypes.INTEGER },
    cols:                { type: DataTypes.INTEGER },
    addressaboveoption:  { type: DataTypes.INTEGER },
    required:            { type: DataTypes.BOOLEAN },
    allcats:             { type: DataTypes.BOOLEAN },
    page1:               { type: DataTypes.BOOLEAN },
    orda:                { type: DataTypes.FLOAT },
    omitforjudging:      { type: DataTypes.BOOLEAN },
    deleted:             { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'Question',
    tableName: 'Question',
    timestamps: false,
  }
);

export default Question;
