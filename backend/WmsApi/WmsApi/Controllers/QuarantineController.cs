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

            if (pallet.Status == PalletStatus.Quarantine || pallet.Status == PalletStatus.WrittenOff
                || pallet.Status == PalletStatus.Rework || pallet.Status == PalletStatus.Claim)
            {
                return BadRequest(new { message = "The pallet is already blocked or has been written off" });
            }

            var quarantineZone = await _db.Locations.FirstOrDefaultAsync(l => l.Code == "LOC-QUAR1");
            if (quarantineZone == null)
                return Problem("Quarantine location LOC-QUAR1 is missing", statusCode: 500);

            var previousStatus = pallet.Status;

            var quarantineCase = new QuarantineCase
            {
                Pallet = pallet,
                Reason = req.Reason
            };

            _db.QuarantineCases.Add(quarantineCase);

            // Only ordinary STORAGE slots are exclusive and need freeing.
            if (pallet.Location?.Zone == Zone.Storage)
                pallet.Location.IsFree = true;

            pallet.Location = quarantineZone;
            pallet.LineName = null;
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
        [HttpGet("areas")]
        public async Task<IActionResult> GetHoldingAreas()
        {
            var pallets = await _db.Pallets
                .Where(p => p.Status == PalletStatus.Rework || p.Status == PalletStatus.Claim)
                .OrderBy(p => p.Status).ThenBy(p => p.Code)
                .Select(p => new
                {
                    palletCode = p.Code,
                    productCode = p.Product!.Code,
                    quantity = p.Quantity,
                    status = p.Status,
                    locationCode = p.Location != null ? p.Location.Code : null
                })
                .ToListAsync();
            return Ok(pallets);
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
            
            if (qCase.Pallet?.Status != PalletStatus.Quarantine)
                return Conflict(new { message = "The pallet is no longer in quarantine" });

            var destinationCode = req.Repairable ? "LOC-REWORK1" : "LOC-CLAIM1";
            var destinationZone = req.Repairable ? Zone.Rework : Zone.Claim;
            var destination = await _db.Locations.FirstOrDefaultAsync(l => l.Code == destinationCode && l.Zone == destinationZone);
            if (destination == null)
                return Problem($"Holding location {destinationCode} is missing", statusCode: 500);

            qCase.Status = req.Repairable ? "REPAIR" : "CLAIM";
            qCase.ResolvedAt = DateTime.UtcNow;
            if (!req.Repairable)
                qCase.ProtocolText = req.ProtocolText;

            // Keep the pallet physically traceable in a shared holding area.
            // A claim is not the same event as physically writing off/discarding a pallet.
            qCase.Pallet.Status = req.Repairable ? PalletStatus.Rework : PalletStatus.Claim;
            qCase.Pallet.Location = destination;
            qCase.Pallet.LineName = null;

            await _db.SaveChangesAsync();
            await _logger.LogAsync(
                req.Repairable ? "QUARANTINE_REWORK" : "QUARANTINE_CLAIM",
                qCase.Pallet.Code, qCase.Pallet.Product!.Code, qCase.Pallet.Quantity,
                Zone.Quarantine, destinationZone, User.Identity?.Name,
                $"Case {qCase.Id} moved to {destination.Code}" +
                (req.Repairable ? "" : $". Claim protocol: {req.ProtocolText}"));

            return Ok(new
            {
                message = req.Repairable ? "Pallet moved to rework area" : "Pallet moved to claim area",
                locationCode = destination.Code,
                palletStatus = qCase.Pallet.Status
            });
        }
    }
}
