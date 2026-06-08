-- Migration 024: Update downloadpagehtml for AEA 2026 (programid 1056)
-- Rewrites legacy table-with-inline-styles markup to clean styled HTML
-- matching the new dark theme. Fixes ../wwwref/ paths to /wwwref/.

UPDATE Program SET downloadpagehtml = N'<style>
.dl-wrap { max-width: 900px; margin: 0 auto; font-size: 14px; }
.dl-wrap h2 { text-align: center; color: #c48f06; margin-bottom: 20px; }
.dl-section { border: 1px solid #555; border-radius: 4px; margin-bottom: 16px; padding: 14px 18px; }
.dl-section-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #c48f06; margin: 0 0 10px; padding: 0; }
.dl-table { width: 100%; border-collapse: collapse; }
.dl-table th { font-size: 12px; font-weight: 600; text-transform: uppercase; color: #c48f06; border-bottom: 1px solid #555; padding: 5px 8px; text-align: left; }
.dl-table th.c, .dl-table td.c { text-align: center; width: 80px; white-space: nowrap; }
.dl-table td { padding: 6px 8px; border-bottom: 1px solid #2a2a2a; font-size: 14px; }
.dl-table tr:last-child td { border-bottom: none; }
.dl-table tr:hover td { background: rgba(255,255,255,0.04); }
.dl-table a { color: #baab85; }
.dl-table a:hover { color: #cf9702; }
</style>
<div class="dl-wrap">
<h2>Downloads</h2>

<div class="dl-section">
<p class="dl-section-title">All Categories</p>
<table class="dl-table">
<thead><tr><th>Document</th><th class="c">MS Word</th><th class="c">PDF</th></tr></thead>
<tbody>
<tr><td>All Categories and Criteria</td><td class="c">&nbsp;</td><td class="c"><a href="/wwwref/aeadocs/CQallcats.pdf" target="_blank">PDF</a></td></tr>
</tbody>
</table>
</div>

<div class="dl-section">
<p class="dl-section-title">Best Event Awards Categories</p>
<table class="dl-table">
<thead><tr><th>Category</th><th class="c">MS Word</th><th class="c">PDF</th></tr></thead>
<tbody>
<tr><td>Best Sporting Event</td><td class="c"><a href="/wwwref/aeadocs/CQsport.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQsport.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Tourism Event</td><td class="c"><a href="/wwwref/aeadocs/CQtourism.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQtourism.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Charity or Cause Related Event</td><td class="c"><a href="/wwwref/aeadocs/CQcharity.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQcharity.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Congress or Conference &lt; 500 Delegates</td><td class="c"><a href="/wwwref/aeadocs/CQcongress500.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQcongress500.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Congress or Conference 500 Delegates or Over</td><td class="c"><a href="/wwwref/aeadocs/CQcongressover.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQcongressover.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Association Event</td><td class="c"><a href="/wwwref/aeadocs/CQassociation.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQassociation.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Exhibition, Trade or Consumer Show</td><td class="c"><a href="/wwwref/aeadocs/CQexhibition.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQexhibition.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Corporate Event</td><td class="c"><a href="/wwwref/aeadocs/CQcorporate.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQcorporate.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Brand Event</td><td class="c"><a href="/wwwref/aeadocs/CQbrand.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQbrand.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Incentive Event</td><td class="c"><a href="/wwwref/aeadocs/CQincentive.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQincentive.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Community Event</td><td class="c"><a href="/wwwref/aeadocs/CQcommunity.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQcommunity.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Cultural, Arts or Music Event</td><td class="c"><a href="/wwwref/aeadocs/CQcultural.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQcultural.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Small Regional Event</td><td class="c"><a href="/wwwref/aeadocs/CQsmallregional.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQsmallregional.pdf" target="_blank">PDF</a></td></tr>
<tr><td>City of Coffs Harbour Best Regional Event</td><td class="c"><a href="/wwwref/aeadocs/CQregional.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQregional.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Small Event</td><td class="c"><a href="/wwwref/aeadocs/CQsmall.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQsmall.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best New Event</td><td class="c"><a href="/wwwref/aeadocs/CQnew.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQnew.pdf" target="_blank">PDF</a></td></tr>
</tbody>
</table>
</div>

<div class="dl-section">
<p class="dl-section-title">Achievement Awards Categories</p>
<table class="dl-table">
<thead><tr><th>Category</th><th class="c">MS Word</th><th class="c">PDF</th></tr></thead>
<tbody>
<tr><td>Best Achievement in Design</td><td class="c"><a href="/wwwref/aeadocs/CQdesign.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQdesign.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Achievement in Marketing or Communication</td><td class="c"><a href="/wwwref/aeadocs/CQmarketing.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQmarketing.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Technical Achievement or Innovation</td><td class="c"><a href="/wwwref/aeadocs/CQtechnical.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQtechnical.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Best Export</td><td class="c"><a href="/wwwref/aeadocs/CQexport.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQexport.pdf" target="_blank">PDF</a></td></tr>
</tbody>
</table>
</div>

<div class="dl-section">
<p class="dl-section-title">Industry Awards Categories</p>
<table class="dl-table">
<thead><tr><th>Category</th><th class="c">MS Word</th><th class="c">PDF</th></tr></thead>
<tbody>
<tr><td>Venue Team of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQvenue.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQvenue.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Event Hotel of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQhotel.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQhotel.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Caterer of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQcaterer.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQcaterer.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Theming, Branding or Styling Company of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQtheming.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQtheming.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Destination Marketing Business of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQdestmarketing.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQdestmarketing.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Production Company of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQprodco.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQprodco.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Hire Company of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQhireco.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQhireco.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Exhibition Services / Event Build Company of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQexposervices.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQexposervices.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Service Company of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQserviceco.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQserviceco.pdf" target="_blank">PDF</a></td></tr>
</tbody>
</table>
</div>

<div class="dl-section">
<p class="dl-section-title">Management Awards Categories</p>
<table class="dl-table">
<thead><tr><th>Category</th><th class="c">MS Word</th><th class="c">PDF</th></tr></thead>
<tbody>
<tr><td>In-House Event Team of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQinhouse.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQinhouse.pdf" target="_blank">PDF</a></td></tr>
<tr><td>PCO of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQpco.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQpco.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Small Event Agency of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQsmallem.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQsmallem.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Public Event Agency of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQpublicem.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQpublicem.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Corporate Event Agency of the Year</td><td class="c"><a href="/wwwref/aeadocs/CQcorporateem.docx" target="_blank">MS Word</a></td><td class="c"><a href="/wwwref/aeadocs/CQcorporateem.pdf" target="_blank">PDF</a></td></tr>
</tbody>
</table>
</div>

<div class="dl-section">
<p class="dl-section-title">Headline Categories</p>
<table class="dl-table">
<thead><tr><th>Category</th><th class="c">MS Word</th><th class="c">PDF</th></tr></thead>
<tbody>
<tr><td>Judges'' Special Award</td><td class="c">&nbsp;</td><td class="c"><a href="/wwwref/aeadocs/CQjudge.pdf" target="_blank">PDF</a></td></tr>
<tr><td>The State or Territory Award</td><td class="c">&nbsp;</td><td class="c"><a href="/wwwref/aeadocs/CQstate.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Event Supplier of the Year</td><td class="c">&nbsp;</td><td class="c"><a href="/wwwref/aeadocs/CQeventsupplier.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Event Agency of the Year</td><td class="c">&nbsp;</td><td class="c"><a href="/wwwref/aeadocs/CQagencyofyear.pdf" target="_blank">PDF</a></td></tr>
<tr><td>Australian Event of the Year</td><td class="c">&nbsp;</td><td class="c"><a href="/wwwref/aeadocs/CQeventofyear.pdf" target="_blank">PDF</a></td></tr>
</tbody>
</table>
</div>

</div>'
WHERE programid = 1056;
