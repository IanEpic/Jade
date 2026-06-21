-- Migration 025: Rewrite standardwelcometext for programid 1056
-- Removes all inline styles, fixed-width tables, legacy colour spans, and &nbsp; padding.
-- Replaces with clean semantic HTML matching the dark theme.
-- Applies to programid 1056 (Australian Event Awards 2026) only.

UPDATE Program
SET standardwelcometext = N'<h2>Welcome to the Australian Event Awards Entry Portal</h2>

<p>The Australian Event Awards Ceremony will take place in <strong>Coffs Harbour, NSW on Wednesday 21 October 2026</strong>.</p>

<p><strong>Entries for the 2026 Australian Event Awards are now open!</strong></p>

<p>This is the only place you can enter the 2026 Australian Event Awards. All entries are completed and submitted online.</p>

<p>You don&rsquo;t have to complete your entry all in one go &mdash; once you&rsquo;ve made a start, you can save and return as many times as you like. Your final entry must be complete by close of entries on <strong>Thursday 16 July 2026 at 11:59pm AEST</strong>. All entries that have been paid for will be submitted for judging at this time.</p>

<p><strong>If you haven&rsquo;t paid, your entry won&rsquo;t be submitted for judging.</strong></p>

<h2>Entry Costs</h2>

<p><strong>Standard:</strong> $563.20 inclusive of GST per entry</p>

<p><strong>Best Charity or Cause Related Event:</strong> $275.00 inclusive of GST per entry</p>

<h2>Key Dates</h2>

<table class="entries-intro-table">
<tbody>
<tr><td>20 April</td><td>Symposium Registrations and Awards Ceremony Bookings Open</td></tr>
<tr><td>16 July @ 11:59pm</td><td>Entries Close</td></tr>
<tr><td>12 August</td><td>National Nominees Announced</td></tr>
<tr><td>28 August</td><td>Early Bird Symposium Registration Discount Deadline</td></tr>
<tr><td>21 October 2026</td><td>Australian Event Awards and Symposium</td></tr>
<tr><td>19&ndash;21 October 2026</td><td>Awards Ceremony</td></tr>
</tbody>
</table>

<h2>Where to Start</h2>

<p>To begin a new entry, click <strong>New Entry</strong> on the left. To continue working on an existing entry, click <strong>My Entries</strong>. If you need help, click the <strong>Help</strong> button at the top of the page, call us on (02) 8096 8777, or email <a href="mailto:enquiries@eventawards.com.au">enquiries@eventawards.com.au</a>.</p>

<h2>Working Offline</h2>

<p>Want to work on your entry offline? Head to the <strong>Downloads</strong> section on the left to download the criteria and questions. When you&rsquo;re ready, log in and copy your completed answers into the relevant entry form. Please disregard any text formatting &mdash; the portal strips it, and judges are interested in content, not presentation.</p>

<p>We recommend uploading your text answers first and saving, then uploading images separately and saving after each upload.</p>

<h2>Simple Entry Requirements</h2>

<p>Write clearly and concisely &mdash; don&rsquo;t pad answers just to reach the word limit. Do review your answers carefully: text sent to judges will be truncated at the word limit. And remember: <strong>evidence is king</strong> &mdash; back up your statements with statistics, stakeholder feedback, and independent commentary.</p>

<h2>Video</h2>

<p>We encourage you to upload video as part of your entry. Although it is not compulsory, it gives judges that &ldquo;I was there&rdquo; feeling. Video is also great promotional material if you are selected as a National Nominee. Judges assess content, not production quality.</p>

<p>If you upload a video, please also send us a high-resolution copy by <strong>23 July 2026</strong> via:</p>

<ul>
<li>Dropbox or similar to <a href="mailto:enquiries@eventawards.com.au">enquiries@eventawards.com.au</a> &mdash; your Entry Number must be the filename; or</li>
<li>Post on USB to the address below.</li>
</ul>

<p>Please label your video with your <strong>Entry Number</strong>.</p>

<p><strong>Postal Address:</strong><br>
Australian Event Awards<br>
c/- The Epic Team Pty Ltd<br>
Suite 1A1, 410 Elizabeth St<br>
Surry Hills NSW 2010</p>

<h2>Multiple Entries</h2>

<p>You can enter the same event or achievement in multiple categories, and you can enter multiple events or achievements in the same category. Entry fees apply to each individual entry.</p>

<h2>Help</h2>

<p>For enquiries about the awards, judging, or the awards night, email <a href="mailto:enquiries@eventawards.com.au">enquiries@eventawards.com.au</a>.</p>

<p>For technical support with the entry portal, email <a href="mailto:support@shadedsolutions.com.au">support@shadedsolutions.com.au</a>.</p>'
WHERE programid = 1056;
