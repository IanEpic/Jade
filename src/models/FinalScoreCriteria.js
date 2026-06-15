import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class FinalScoreCriteria extends Model {}

FinalScoreCriteria.init({
    finalscoreid: { type: DataTypes.INTEGER, primaryKey: true },
    criteriaid:   { type: DataTypes.INTEGER, primaryKey: true },
    criterianame: { type: DataTypes.STRING,  allowNull: true },
    weight:       { type: DataTypes.FLOAT,   allowNull: true },
    score:        { type: DataTypes.FLOAT,   allowNull: true },
}, {
    sequelize,
    modelName: 'FinalScoreCriteria',
    tableName: 'FinalScoreCriteria',
    timestamps: false,
});

export default FinalScoreCriteria;
