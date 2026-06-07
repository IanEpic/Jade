import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class UserCredential extends Model {}

UserCredential.init(
  {
    credentialid:      { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email:             { type: DataTypes.STRING(255), allowNull: false },
    password:          { type: DataTypes.STRING(100), allowNull: false },
    mustchangepassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    activated:          { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    activationtoken:    { type: DataTypes.STRING(100), allowNull: true },
  },
  {
    sequelize,
    modelName: 'UserCredential',
    tableName: 'UserCredential',
    timestamps: false,
  }
);

export default UserCredential;
