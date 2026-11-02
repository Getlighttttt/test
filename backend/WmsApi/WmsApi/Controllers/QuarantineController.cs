using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WmsApi.Data;
using WmsApi.Models;

namespace WmsApi.Controllers
{
    [ApiController]
    [Route("api/quarantine")]
    [Authorize]

    public class QuarantineController : ControllerBase
    {
        private readonly Db1Context _db;
        private readonly MovementLogger _logger;

        public QuarantineController(Db1Context db, MovementLogger logger) => (_db, _logger) = (db, logger);

        [Authorize(Roles = "Skladnik")]
        [HttpPost]
        public async Task<IActionResult> SetQuarantine(QuarantineRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Reason)){
                return BadRequest(new { message = "No reason given" });
            }

            var pallet = await _db.Pallets.Include(p => p.Product).Include(p => p.Location).FirstOrDefaultAsync(p => p.Code == req.PalletCode);
            if (pallet == null)
            {
                return NotFound(new { message = "An unknown palette" });
            }

            if (pallet.Status == PalletStatus.Quarantine || pallet.Status == PalletStatus.WrittenOff)
            {
                return BadRequest(new { message = "The pallet is already in quarantine or has been written off" });
            }

            var previousStatus = pallet.Status;

            var quarantineCase = new QuarantineCase
            {
                Pallet = pallet,
                Reason = req.Reason
            };

            _db.QuarantineCases.Add(quarantineCase);

            if(pallet.Location != null)
            {
                pallet.Location.IsFree = true;
            }
            
            var quarantineZone = await _db.Locations.FirstOrDefaultAsync(l => l.Zone == Models.Zone.Quarantine);
            pallet.Location = quarantineZone;
            pallet.Status = PalletStatus.Quarantine;
            await _db.SaveChangesAsync();
            await _logger.LogAsync("QUARANTINE", pallet.Code, pallet.Product.Code, pallet.Quantity, null, Zone.Quarantine, User.Identity?.Name, $"Pôvodný stav: {previousStatus}, dôvod: {req.Reason}");
            return Ok(new { message = "The pallet has been placed in quarantine", palletId = pallet.Id});
        }

        [Authorize(Roles = "Dispecer")]
        [HttpGet("open")]
        public async Task<IActionResult> GetOpenCases()
        {
            var openCases = await _db.QuarantineCases.Where(s => s.Status == "OPEN").Include(c => c.Pallet).ThenInclude(p => p!.Product).ToListAsync();
            var openCasesResponse = openCases.Select(c => new {id = c.Id, palletCode = c.Pallet.Code, productCode = c.Pallet.Product.Code, quantity = c.Pallet.Quantity, reason = c.Reason, createdAt = c.CreatedAt}).ToList();
            return Ok(openCasesResponse);
        }

        [Authorize(Roles = "Dispecer")]
        [HttpPost("{id}/decision")]

        public async Task<IActionResult> SetDecision(int id, QuarantineDecisionRequest req)
        {
            var qCase = await _db.QuarantineCases.Include(c => c.Pallet).ThenInclude(p => p!.Product).FirstOrDefaultAsync(c => c.Id == id);
            if(qCase == null)
            {
                return NotFound(new { message = "Unknown requirement" });
            }

            if(qCase.Status != "OPEN")
            {
                return BadRequest(new { message = "It’s all sorted now" });
            }

            if(req.Repairable == false && string.IsNullOrWhiteSpace(req.ProtocolText))
            {
                return BadRequest(new { message = "This report is essential for making a claim" });
            }
            
            if(req.Repairable == true) {
                qCase.Status = "REPAIR";
                qCase.ResolvedAt = DateTime.UtcNow;
                qCase.Pallet!.Status = PalletStatus.Received;
                qCase.Pallet.LocationId = null;
            }
            else
            {
                qCase.Status = "CLAIM";
                qCase.ProtocolText = req.ProtocolText;
                qCase.ResolvedAt = DateTime.UtcNow;
                qCase.Pallet!.Status = PalletStatus.WrittenOff;
                qCase.Pallet.LocationId = null;
            }

            await _db.SaveChangesAsync();
            await _logger.LogAsync(req.Repairable ? "QUARANTINE_REPAIR" : "WRITE_OFF", qCase.Pallet!.Code, qCase.Pallet.Product!.Code, qCase.Pallet.Quantity, Zone.Quarantine, req.Repairable ? Zone.Receiving : null, User.Identity?.Name, req.Repairable ? $"Case {qCase.Id}: repairable" : $"Case {qCase.Id}: complaint. Minutes: {req.ProtocolText}");
            return Ok(new { message = "The request has been resolved" });
        }
    }
}
