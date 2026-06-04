import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

// TODO: replace stub columns with full definition from EPIC::JADE::JudgeEntryLinkMobile Perl model
class JudgeEntryLinkMobile extends Model {}

JudgeEntryLinkMobile.init(
  {
    // Stub — add real columns when converting the Perl model
  },
  {
    sequelize,
    modelName: 'JudgeEntryLinkMobile',
    tableName: 'JudgeEntryLinkMobile',
    timestamps: false,
  }
);

export default JudgeEntryLinkMobile;
