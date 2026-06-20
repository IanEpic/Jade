// services/addressService.js
// Pool all Address records visible to a given credential:
//   - addresses created under any User row sharing this credential
//   - addresses linked as street/postal on any of that user's Entrants
import { getPool, sql } from '../config/database.js';

export async function loadAddressesForCredential(credentialid) {
    const pool = await getPool();
    const result = await pool.request()
        .input('credentialid', sql.Int, credentialid)
        .query(`
            SELECT DISTINCT a.*
            FROM Address a
            WHERE a.deleted = 0
              AND (
                a.userid IN (
                    SELECT userid FROM [User] WHERE credentialid = @credentialid
                )
                OR a.addressid IN (
                    SELECT streetaddressid FROM Entrant
                    WHERE deleted = 0
                      AND streetaddressid IS NOT NULL
                      AND userid IN (SELECT userid FROM [User] WHERE credentialid = @credentialid)
                    UNION
                    SELECT postaladdressid FROM Entrant
                    WHERE deleted = 0
                      AND postaladdressid IS NOT NULL
                      AND userid IN (SELECT userid FROM [User] WHERE credentialid = @credentialid)
                )
              )
            ORDER BY a.addressid
        `);
    return result.recordset;
}
