-- Migration 029: Restyle all remaining welcome text fields for programid 1056
-- adminwelcometext, judgewelcometext, finalistwelcometext, nonfinalistwelcometext
-- Applies the same .welcome-section card pattern as standardwelcometext (migration 028).
-- Note: judgewelcometext still contains 2025 dates — update separately before judging opens.
-- Applies to programid 1056 (Australian Event Awards 2026) only.

-- ── Admin welcome ──────────────────────────────────────────────────────────────
UPDATE Program SET adminwelcometext = N'<h2>Australian Event Awards 2026</h2>

<p>Welcome back. Here''s a quick overview of the current program status and key dates.</p>

<div class="welcome-section">
<h3>Key Dates</h3>
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
</div>

<div class="welcome-section">
<h3>Entry Costs</h3>
<table>
<tbody>
<tr><td>Standard</td><td>$563.20 inc. GST per entry</td></tr>
<tr><td>Best Charity or Cause Related Event</td><td>$275.00 inc. GST per entry</td></tr>
</tbody>
</table>
</div>

<div class="welcome-section">
<h3>Contact</h3>
<p>Awards enquiries: <a href="mailto:enquiries@eventawards.com.au">enquiries@eventawards.com.au</a> &mdash; (02) 8096 8777</p>
<p>Portal support: <a href="mailto:support@shadedsolutions.com.au">support@shadedsolutions.com.au</a></p>
</div>'
WHERE programid = 1056;

-- ── Judge welcome ──────────────────────────────────────────────────────────────
UPDATE Program SET judgewelcometext = N'<h2>Judge Information &mdash; Please Read</h2>

<p>Thank you for agreeing to be a judge of the Australian Event Awards 2026. We are most grateful for your commitment and expertise and hope you will find the experience both informative and rewarding.</p>
<p>When you are ready to begin, click <strong>To Judge</strong> on the left to view your allocated entries.</p>

<div class="welcome-section">
<h3>Important Points</h3>
<ol>
<li><strong>Conflicts of Interest:</strong> Please review your allocated entries for conflicts of interest by COB Friday 1 August 2025. You will be asked to declare any conflicts by that date.</li>
<li><strong>Score the Entries:</strong> Please score all criteria in each entry between 1 and 7. Scoring is explained below.</li>
<li><strong>Comments</strong> are very important to entrants. Please provide at least two comments per entry.</li>
<li>You must <strong>complete judging</strong> of all your entries <strong>by midnight AEST on Sunday 10 August 2025</strong>.</li>
</ol>
</div>

<div class="welcome-section">
<h3>Your Entries &amp; Conflicts of Interest</h3>
<p>Entries allocated to you will be available from Friday 1 August 2025. Please review them <strong>as soon as possible</strong> to check for conflicts of interest and let us know by <strong>COB Friday 1 August 2025</strong> so entries can be reallocated in time.</p>
<p>To avoid conflicts of interest and ensure the greatest spread of opinion, we may not have allocated you all entries in any particular category. In some instances entries are spread across the judging pool, with a minimum of two judges assessing each entry.</p>
</div>

<div class="welcome-section">
<h3>Criteria &amp; Scoring</h3>
<p>Each category is assessed against different criteria, developed by the Co-chairs of the Industry Judging Panel and made available to entrants during entry preparation. Please read the entire entry before scoring.</p>
<p>Please provide a score out of 7 for each criterion:</p>
<table>
<tbody>
<tr><td>1 &ndash; 2</td><td>Demonstrates little or no understanding of the criteria, or addresses it at an unsatisfactory level</td></tr>
<tr><td>3 &ndash; 4</td><td>Demonstrates satisfactory understanding of the criteria and addresses it at a satisfactory level</td></tr>
<tr><td>5 &ndash; 7</td><td>Demonstrates a good working understanding of the criteria and a high level of achievement in addressing it</td></tr>
</tbody>
</table>
<p>The Nominee Threshold average raw score is <strong>3.85</strong>. Entries meeting this minimum will be eligible as Nominees. Entrants do not see the raw scores you provide.</p>
<p>You can return at any time before judging closes to adjust your scores. Judging is not complete until you have provided scores for all criteria and two comments. Click <strong>Record Scores and Comments</strong> at the bottom of the entry form when done.</p>
</div>

<div class="welcome-section">
<h3>Comments for Entrants</h3>
<p>Comments are as important as scores &mdash; almost every entrant reviews their feedback carefully. Please provide feedback on:</p>
<ul>
<li>the areas in which the entrant has excelled in relation to their achievement</li>
<li>areas where improvement could be made in future years</li>
<li>any other comments of use to the entrant</li>
</ul>
<p>Please <strong>don&rsquo;t</strong> comment on <strong>how</strong> the entry was written. Focus on the achievement, not grammar or wording. The improvement comment is keenly read &mdash; please try to find at least one area for improvement in every entry.</p>
<p>Please do not identify yourself &mdash; comments may be made available to the entrant without further editing.</p>
<p><strong>Where comments do not provide the required feedback, judges will be asked to update them within 48 hours.</strong></p>
<p>Examples of comments: <a href="http://eventawards.com.au/wp-content/uploads/2025/Comments-for-Entrants.pdf" target="_blank" rel="noopener">Comments for Entrants (PDF)</a></p>
</div>

<div class="welcome-section">
<h3>What Happens Next</h3>
<p>First round scoring closes at <strong>midnight AEST on Sunday 10 August 2025</strong>. Scores are then collated, criteria weighting applied, and judges&rsquo; scores scaled for even comparison using a process designed by a statistical analysis consultant.</p>
<p>The top five entries meeting the Nominee Threshold Score in each category become Automatic Nominees. These nominees will be presented back to you on <strong>Tuesday 12 August 2025</strong>.</p>
<p>You may nominate any non-Automatic Nominee that you believe is indistinguishable in quality from the Automatic Nominees by advising the Management Company in writing by <strong>5:00pm AEST Wednesday 13 August 2025</strong>.</p>
<p>The review panel will discuss nominations via teleconference on <strong>Thursday 14 August, 11:00am &ndash; 12:00pm AEST</strong>. Between Monday 25 and Wednesday 27 August, Lead Judges and Co-Chairs will meet to select winners.</p>
</div>

<div class="welcome-section">
<h3>Feedback</h3>
<p>As a member of the Industry Judging Panel we value your feedback on your experience and on the program. Click <strong>Make a Comment</strong> in the menu bar to record your thoughts on the process, criteria, entry standards, or anything else. We review all feedback at the end of judging.</p>
<p>Please don&rsquo;t use Make a Comment to raise judging queries &mdash; we won&rsquo;t review comments until after judging closes.</p>
</div>

<div class="welcome-section">
<h3>Need Help?</h3>
<p>If something is still unclear after reading the above, try clicking <strong>Help</strong> in the top menu, or contact us:</p>
<p>Phone: (02) 8096 8777<br>
Email: <a href="mailto:enquiries@eventawards.com.au">enquiries@eventawards.com.au</a></p>
</div>'
WHERE programid = 1056;

-- ── Finalist welcome ───────────────────────────────────────────────────────────
UPDATE Program SET finalistwelcometext = N'<h2>Congratulations on Your Success!</h2>

<p>Please see your results below. Each entry will be listed as a National Nominee, a State or Territory Nominee, or a Non-Finalist.</p>

<div class="welcome-section">
<h3>Understanding Your Result</h3>
<p><strong>National Nominee:</strong> The entries receiving the top five Moderated Scores in each category, provided they meet the Nominee Threshold Score. National Nominee entries are reviewed by the Lead Judge, who recommends the winning entry to the Co-Chairs. Winners are announced at the Awards Ceremony.</p>
<p><strong>State / Territory Nominee:</strong> For each Best Event category, the two highest ranked events from each state or territory receive State/Territory Nominee status. State and Territory Winners are announced after the National Nominees and Winners at the ceremony.</p>
<p>Read more: <a href="http://www.eventawards.com.au/judging">www.eventawards.com.au/judging</a></p>
<p>Scores for both National and State/Territory Nominees will be made available at the conclusion of the Awards Ceremony.</p>
</div>

<div class="welcome-section">
<h3>Nominee Logo &amp; Promo Kits</h3>
<p>To download logo kits to publicise your status as a Nominee, click <strong>Download Logo / Promo Pack</strong> in your result below. Make sure you select the right options based on your result.</p>
</div>

<div class="welcome-section">
<h3>2026 Australian Event Awards &amp; Symposium</h3>
<p><strong>Australian Event Symposium:</strong> 19&ndash;21 October 2026<br>
<strong>Awards Ceremony:</strong> Wednesday 21 October 2026<br>
<strong>Venue:</strong> Coffs Harbour, NSW</p>
<p>National Winners and State/Territory Winners will be announced at the Ceremony, with all Nominees recognised for their achievements.</p>
</div>'
WHERE programid = 1056;

-- ── Non-finalist welcome ───────────────────────────────────────────────────────
UPDATE Program SET nonfinalistwelcometext = N'<h2>The Results Are In</h2>

<p>Please see your results below for the Australian Event Awards 2026.</p>
<p>The judges have asked us to communicate that competition this year was of a very high standard, so please don&rsquo;t be discouraged if you didn&rsquo;t make it through. The judges have commended many aspects of entries and these commendations can be found in the scores and comments.</p>

<div class="welcome-section">
<h3>About Your Scores &amp; Comments</h3>
<ul>
<li>Every entry is assessed by at least two judges who judge independently and &lsquo;blind&rsquo;. You may notice some inconsistency between feedback comments &mdash; this reflects the different perspectives of the judges assessing your entry.</li>
<li>Each category has a different judging team assessed against different criteria. If your event was entered in more than one category, you may receive different scores and comments from each team.</li>
<li>The scores shown are the Moderated First Round Judges Scores, intended as a benchmark against which you can assess your entries against past or future submissions.</li>
</ul>
<p>You are welcome to use judges&rsquo; comments in your marketing collateral &mdash; please credit <em>The Australian Event Awards Judging Panel</em>.</p>
</div>'
WHERE programid = 1056;
