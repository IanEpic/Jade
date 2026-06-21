// Temporary runner for migration 035 — delete after use
import sequelize from '../src/config/sequelize.js';

try {
    await sequelize.query(`ALTER TABLE UserCredential ADD
        firstname    NVARCHAR(100) NULL,
        lastname     NVARCHAR(100) NULL,
        organisation NVARCHAR(200) NULL,
        telephone    NVARCHAR(50)  NULL,
        mobile       NVARCHAR(50)  NULL,
        fax          NVARCHAR(50)  NULL,
        superadmin   BIT           NOT NULL DEFAULT 0`);
    console.log('columns added');

    await sequelize.query(`
        WITH RankedUsers AS (
            SELECT credentialid, firstname, lastname, organisation, telephone, mobile, fax,
                ROW_NUMBER() OVER (
                    PARTITION BY credentialid
                    ORDER BY
                        CASE WHEN firstname IS NOT NULL AND firstname <> '' THEN 0 ELSE 1 END,
                        programid DESC
                ) AS rn
            FROM [User]
            WHERE credentialid IS NOT NULL
        )
        UPDATE uc SET
            uc.firstname    = ru.firstname,
            uc.lastname     = ru.lastname,
            uc.organisation = ru.organisation,
            uc.telephone    = ru.telephone,
            uc.mobile       = ru.mobile,
            uc.fax          = ru.fax
        FROM UserCredential uc
        INNER JOIN RankedUsers ru ON ru.credentialid = uc.credentialid AND ru.rn = 1`);
    console.log('backfill done');

    const [count] = await sequelize.query(`SELECT COUNT(*) AS n FROM UserCredential WHERE firstname IS NOT NULL`);
    console.log('credentials with firstname:', count[0].n);

    const [spot] = await sequelize.query(`SELECT credentialid, email, firstname, lastname, organisation FROM UserCredential WHERE email = 'ian.steigrad@gmail.com'`);
    console.log('spot check:', JSON.stringify(spot[0]));

} catch (e) {
    console.error(e.message);
}
process.exit(0);
