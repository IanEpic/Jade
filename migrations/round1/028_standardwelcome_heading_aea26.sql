-- Migration 028: Update standardwelcometext for programid 1056
-- Moves the Welcome heading to a top-level h2 (centred, larger),
-- removes the card from the intro section, keeps cards for all other sections.
-- Applies to programid 1056 (Australian Event Awards 2026) only.

UPDATE Program
SET standardwelcometext = N'<h2>Welcome</h2>

<p>Welcome to the Australian Event Awards Entry Portal &mdash; the only place to enter the 2026 Australian Event Awards. All entries are completed and submitted online.</p>
<p>The Awards Ceremony will take place in <strong>Coffs Harbour, NSW on Wednesday 21 October 2026</strong>.</p>
<p><strong>Entries for the 2026 Australian Event Awards are now open!</strong></p>

<div class="welcome-section">
<h3>Entry Costs</h3>
<table>
<tbody>
<tr><td>Standard</td><td>$563.20 inclusive of GST per entry</td></tr>
<tr><td>Best Charity or Cause Related Event</td><td>$275.00 inclusive of GST per entry</td></tr>
</tbody>
</table>
</div>

<div class="welcome-section">
<h3>Key Dates</h3>
<table>
<tbody>
<tr><td>20 April</td><td>Symposium Registrations and Awards Ceremony Bookings Open</td></tr>
<tr><td>16 July @ 11:59pm</td><td>Entries Close</td></tr>
<tr><td>12 August</td><td>National Nominees Announced</td></tr>
<tr><td>28 August</td><td>Early Bird Symposium Registration Discount Deadline</td></tr>
<tr><td>19&ndash;21 October 2026</td><td>Australian Event Awards and Symposium, Coffs Harbour NSW</td></tr>
</tbody>
</table>
</div>

<div class="welcome-section">
<h3>How to Enter</h3>
<p>You don&rsquo;t have to complete your entry all in one go &mdash; once you&rsquo;ve made a start, you can save and return as many times as you like. Your final entry must be complete by close of entries on <strong>Thursday 16 July 2026 at 11:59pm AEST</strong>. All entries that have been paid for will be submitted for judging at this time.</p>
<p><strong>If you haven&rsquo;t paid, your entry won&rsquo;t be submitted for judging.</strong></p>
<p>To begin a new entry, click <strong>New Entry</strong> on the left. To continue working on an existing entry, click <strong>My Entries</strong>.</p>
</div>

<div class="welcome-section">
<h3>Working Offline</h3>
<p>Head to the <strong>Downloads</strong> section to download the criteria and questions. When you&rsquo;re ready, log in and paste your completed answers into the entry form. Please disregard any text formatting &mdash; the portal strips it, and judges are interested in content, not presentation.</p>
<p>We recommend uploading text answers first and saving, then uploading images separately.</p>
</div>

<div class="welcome-section">
<h3>Tips for a Strong Entry</h3>
<p>Write clearly and concisely &mdash; don&rsquo;t pad answers to reach the word limit. Review carefully: text sent to judges is truncated at the word limit. <strong>Evidence is king</strong> &mdash; back up statements with statistics, stakeholder feedback, and independent commentary.</p>
</div>

<div class="welcome-section">
<h3>Video</h3>
<p>We encourage you to upload video as part of your entry. It gives judges that &ldquo;I was there&rdquo; feeling and is great promotional material if you become a National Nominee. Judges assess content, not production quality.</p>
<p>If you upload a video, please also send a high-resolution copy by <strong>23 July 2026</strong> via Dropbox or similar to <a href="mailto:enquiries@eventawards.com.au">enquiries@eventawards.com.au</a> (Entry Number must be the filename), or post on USB to: Australian Event Awards &mdash; c/- The Epic Team Pty Ltd, Suite 1A1, 410 Elizabeth St, Surry Hills NSW 2010.</p>
<p>Please label your video with your <strong>Entry Number</strong>.</p>
</div>

<div class="welcome-section">
<h3>Multiple Entries</h3>
<p>You can enter the same event in multiple categories, and multiple events in the same category. Entry fees apply to each individual entry.</p>
</div>

<div class="welcome-section">
<h3>Help</h3>
<p>Awards enquiries: <a href="mailto:enquiries@eventawards.com.au">enquiries@eventawards.com.au</a> &nbsp;&mdash;&nbsp; (02) 8096 8777</p>
<p>Portal support: <a href="mailto:support@shadedsolutions.com.au">support@shadedsolutions.com.au</a></p>
</div>'
WHERE programid = 1056;
