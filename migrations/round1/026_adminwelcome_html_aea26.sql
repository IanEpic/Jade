-- Migration 026: Rewrite adminwelcometext for programid 1056
-- Admin-facing welcome shown on the home page for admin users.
-- Shorter than standardwelcometext — focuses on program status and key dates
-- rather than entrant how-to guidance. Clean HTML, no inline styles.
-- Applies to programid 1056 (Australian Event Awards 2026) only.

UPDATE Program
SET adminwelcometext = N'<h2>Australian Event Awards 2026</h2>

<p>Welcome back. Here''s a quick overview of the program status and key dates.</p>

<h2>Key Dates</h2>

<table>
<tbody>
<tr><td>20 April</td><td>Symposium Registrations and Awards Ceremony Bookings Open</td></tr>
<tr><td>16 July @ 11:59pm</td><td>Entries Close</td></tr>
<tr><td>23 July</td><td>Video Submission Deadline</td></tr>
<tr><td>12 August</td><td>National Nominees Announced</td></tr>
<tr><td>28 August</td><td>Early Bird Symposium Registration Discount Deadline</td></tr>
<tr><td>19&ndash;21 October 2026</td><td>Australian Event Awards and Symposium, Coffs Harbour NSW</td></tr>
</tbody>
</table>

<h2>Entry Costs</h2>

<table>
<tbody>
<tr><td>Standard</td><td>$563.20 inc. GST per entry</td></tr>
<tr><td>Best Charity or Cause Related Event</td><td>$275.00 inc. GST per entry</td></tr>
</tbody>
</table>

<h2>Contact</h2>

<p>Awards enquiries: <a href="mailto:enquiries@eventawards.com.au">enquiries@eventawards.com.au</a><br>
Portal support: <a href="mailto:support@shadedsolutions.com.au">support@shadedsolutions.com.au</a></p>'
WHERE programid = 1056;
