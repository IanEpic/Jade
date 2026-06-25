import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/sequelize.js';

class Payment extends Model {}

Payment.init(
  {
    paymentid:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userid:              { type: DataTypes.INTEGER },
    date:                { type: DataTypes.DATE },
    method:              { type: DataTypes.STRING },
    amount:              { type: DataTypes.DECIMAL(19,4) },
    ewayCardHoldersName: { type: DataTypes.STRING },
    ewayCardNumber:      { type: DataTypes.STRING },
    ewayCardExpiryMonth: { type: DataTypes.STRING },
    ewayCardExpiryYear:  { type: DataTypes.STRING },
    ewayCVN:             { type: DataTypes.STRING },
    ewayTrxnStatus:      { type: DataTypes.STRING },
    ewayTrxnNumber:      { type: DataTypes.STRING },
    ewayTrxnReference:   { type: DataTypes.STRING },
    ewayTrxnOption1:     { type: DataTypes.STRING },
    ewayTrxnOption2:     { type: DataTypes.STRING },
    ewayTrxnOption3:     { type: DataTypes.STRING },
    ewayAuthCode:        { type: DataTypes.STRING },
    ewayReturnAmount:    { type: DataTypes.STRING },
    ewayTrxnError:       { type: DataTypes.STRING },
    chequeDrawer:        { type: DataTypes.STRING },
    chequeDate:          { type: DataTypes.DATE },
    chequeBSB:           { type: DataTypes.STRING },
    chequeAcct:          { type: DataTypes.STRING },
    chequeNumber:        { type: DataTypes.STRING },
    directDepositRef:    { type: DataTypes.STRING },
    refunded:            { type: DataTypes.BOOLEAN },
    report:              { type: DataTypes.BOOLEAN },
    processedby:         { type: DataTypes.INTEGER },
  },
  { sequelize, modelName: 'Payment', tableName: 'Payment', timestamps: false }
);

export default Payment;
