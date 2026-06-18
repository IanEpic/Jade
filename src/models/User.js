import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class User extends Model {}

User.init(
  {
    userid:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    programid:            { type: DataTypes.INTEGER, allowNull: false },
    credentialid:         { type: DataTypes.INTEGER },
    postaladdressid:      { type: DataTypes.INTEGER },
    paymentsopen:         { type: DataTypes.BOOLEAN },
    judgingopen:          { type: DataTypes.BOOLEAN },
    judge:                { type: DataTypes.BOOLEAN },
    admin:                { type: DataTypes.BOOLEAN },
    chairperson:          { type: DataTypes.BOOLEAN },
    enabled:              { type: DataTypes.BOOLEAN },
    deleted:              { type: DataTypes.BOOLEAN },
    judgetc:              { type: DataTypes.BOOLEAN },
    judgesuggestionid:    { type: DataTypes.INTEGER },
    exclude:              { type: DataTypes.BOOLEAN },
    feedbackleft:         { type: DataTypes.BOOLEAN },
    viewentries:          { type: DataTypes.BOOLEAN },
    reviewer:             { type: DataTypes.BOOLEAN },
    simplejudge:          { type: DataTypes.BOOLEAN },
    onlyjudgepostreview:  { type: DataTypes.BOOLEAN },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'User',
    timestamps: false,
  }
);

export default User;
