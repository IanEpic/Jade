// associations.js
// All has_a() and has_many() declarations for Entry, Program, and User.
// Call setupAssociations() once at boot, after all models are loaded.

import Entry from './Entry.js';
import Program from './Program.js';
import Entrant from './Entrant.js';
import User from './User.js';
import Category from './Category.js';
import Invoice from './Invoice.js';
import Response from './Response.js';
import Score from './Score.js';
import JudgeEntryLink from './JudgeEntryLink.js';
import JudgeEntryLinkMobile from './JudgeEntryLinkMobile.js';
import JudgeEntryLinkWildcardNomination from './JudgeEntryLinkWildcardNomination.js';
import JudgeComment from './JudgeComment.js';
import JudgeCategoryLink from './JudgeCategoryLink.js';
import FinalScore from './FinalScore.js';
import Nomination from './Nomination.js';
import TravelPackage from './TravelPackage.js';
import Terminology from './Terminology.js';
import Address from './Address.js';
import JudgingModel from './JudgingModel.js';
import JudgeSuggestion from './JudgeSuggestion.js';
import Payment from './Payment.js';
import UserPage from './UserPage.js';
import Eligibility from './Eligibility.js';
import Question from './Question.js';
import UserCredential from './UserCredential.js';

export function setupAssociations() {

  // ── Entry associations ────────────────────────────────────────────────────
  Entry.belongsTo(Program,   { foreignKey: 'programid',  as: 'program'   });
  Entry.belongsTo(Entrant,   { foreignKey: 'entrantid',  as: 'entrant'   });
  Entry.belongsTo(User,      { foreignKey: 'userid',     as: 'user'      });
  Entry.belongsTo(Category,  { foreignKey: 'categoryid', as: 'category'  });
  Entry.belongsTo(Invoice,   { foreignKey: 'invoiceid',  as: 'invoice'   });

  Entry.hasMany(Response,                        { foreignKey: 'entryid', as: 'responses'             });
  Entry.hasMany(Score,                           { foreignKey: 'entryid', as: 'scores',               order: [['scoreid', 'ASC']] });
  Entry.hasMany(JudgeEntryLink,                  { foreignKey: 'entryid', as: 'judgeentrylinks',       order: [['linkid',  'ASC']] });
  Entry.hasMany(JudgeEntryLinkMobile,            { foreignKey: 'entryid', as: 'judgeentrylinksmobile', order: [['linkid',  'ASC']] });
  Entry.hasMany(JudgeComment,                    { foreignKey: 'entryid', as: 'judgecomments'          });
  Entry.hasMany(FinalScore,                      { foreignKey: 'entryid', as: 'finalscores'            });
  Entry.hasMany(Nomination,                      { foreignKey: 'entryid', as: 'nominations'            });
  Entry.hasMany(TravelPackage,                   { foreignKey: 'entryid', as: 'travelpackages'         });

  // has_many through — judges via JudgeEntryLink
  Entry.belongsToMany(User, {
    through:    JudgeEntryLink,
    foreignKey: 'entryid',
    otherKey:   'userid',
    as:         'judges',
  });

  // ── Program associations ──────────────────────────────────────────────────
  Program.belongsTo(JudgingModel, { foreignKey: 'judgingmodelid',as: 'judgingmodel'  });

  Program.hasMany(User,        { foreignKey: 'programid', as: 'users'        });
  Program.hasMany(Category,    { foreignKey: 'programid', as: 'categories'   });
  Program.hasMany(Question,    { foreignKey: 'programid', as: 'questions'    });
  Program.hasMany(UserPage,    { foreignKey: 'programid', as: 'userpages'    });
  Program.hasMany(Eligibility, { foreignKey: 'programid', as: 'eligibilities'});
  Program.hasMany(Terminology, { foreignKey: 'programid', as: 'terminology'  });

  // ── UserCredential associations ───────────────────────────────────────────
  UserCredential.hasMany(User, { foreignKey: 'credentialid', as: 'users' });
  User.belongsTo(UserCredential, { foreignKey: 'credentialid', as: 'credential' });
  UserCredential.belongsTo(Address, { foreignKey: 'postaladdressid', as: 'postaladdress' });
  UserCredential.belongsTo(Address, { foreignKey: 'streetaddressid', as: 'streetaddress' });

  // ── User associations ─────────────────────────────────────────────────────
  User.belongsTo(Program,         { foreignKey: 'programid',      as: 'program'         });

  // ── Entrant associations ──────────────────────────────────────────────────
  Entrant.belongsTo(Address, { foreignKey: 'streetaddressid', as: 'streetaddress' });
  Entrant.belongsTo(Address, { foreignKey: 'postaladdressid', as: 'postaladdress' });
  User.belongsTo(JudgeSuggestion, { foreignKey: 'judgesuggestionid', as: 'judgesuggestion' });

  User.hasMany(Entrant,          { foreignKey: 'userid', as: 'entrants',           order: [['entrantid',    'ASC']] });
  User.hasMany(Entry,            { foreignKey: 'userid', as: 'entries',            order: [['entryid',      'ASC']] });
  User.hasMany(Invoice,          { foreignKey: 'userid', as: 'invoices',           order: [['invoiceid',    'ASC']] });
  User.hasMany(Payment,          { foreignKey: 'userid', as: 'payments',           order: [['paymentid',    'ASC']] });
  User.hasMany(JudgeCategoryLink,{ foreignKey: 'userid', as: 'judgecategorylinks', order: [['linkid',       'ASC']] });
  User.hasMany(Category,         { foreignKey: 'userid', as: 'headjudgecats',      order: [['categoryid',   'ASC']] });
  User.hasMany(JudgeEntryLink,   { foreignKey: 'userid', as: 'judgeentrylinks',    order: [['linkid',       'ASC']] });
  User.hasMany(Score,            { foreignKey: 'userid', as: 'scores',             order: [['scoreid',      'ASC']] });
  User.hasMany(JudgeComment,     { foreignKey: 'userid', as: 'judgecomments',      order: [['commentid',    'ASC']] });
  User.hasMany(Nomination,       { foreignKey: 'userid', as: 'nominations',        order: [['nominationid', 'ASC']] });
  User.hasMany(JudgeEntryLinkWildcardNomination, { foreignKey: 'userid', as: 'wildcardnominations', order: [['linkid', 'ASC']] });

  // has_many through
  User.belongsToMany(Entry,    { through: JudgeEntryLink,    foreignKey: 'userid', otherKey: 'entryid',    as: 'entriestojudge'     });
  User.belongsToMany(Category, { through: JudgeCategoryLink, foreignKey: 'userid', otherKey: 'categoryid', as: 'categoriestojudge'  });
}
