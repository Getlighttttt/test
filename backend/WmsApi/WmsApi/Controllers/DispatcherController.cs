using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Threading.Channels;
using WmsApi.Data;
using WmsApi.Models;

namespace WmsApi.Controllers
{
    [ApiController]
    [Route("api/dispecer")]
    [Authorize(Roles = "Dispecer")]

    public class DispecerController : ControllerBase
    {
        private readonly Db1Context _db;
        private readonly MovementLogger _logger;

        public DispecerController(Db1Context db, MovementLogger logger) => (_db, _logger) = (db, logger);

        [HttpGet("deviations")]
        public async Task<IActionResult> GetDeviations()
        {
            var deviations = await _db.Receipts.Where(r => r.Status == "WITH_DEVIATION").Include(r => r.Order).ToListAsync();
            var deviationOrders = deviations.Select(r => new { orderNumber = r.Order.OrderNumber, note = r.Note, id = r.Id, createdAt = r.CreatedAt });

            return Ok( deviationOrders);
        }

        [HttpPost("deviations/{receiptId}/decision")]
        public async Task<IActionResult> Decision(int receiptId, DecisionRequest req)
        {
            var reception = await _db.Receipts.FirstOrDefaultAsync(r => r.Id == receiptId);
            if (reception == null)
            {
                return NotFound(new {message = "Unknown income" });
            }

            if(reception.Status != "WITH_DEVIATION")
            {
                return BadRequest(new { message = "The recipe does not contain any incorrect information" });
            }

            reception.Status = req.Approve ? "APPROVED" : "REJECTED";

            await _db.SaveChangesAsync();
            
            if (reception.Status == "REJECTED")
            {
                await _logger.LogAsync(req.Approve ? "DEVIATION_APPROVED" : "DEVIATION_REJECTED", "", "", 0, null, null, User.Identity?.Name, $"Receipt {reception.Id}");
            }

            return Ok(new { message = "The recipe has been changed" });
            }

        [HttpGet("stock")]
        public async Task<IActionResult> GetStock()
        {
            var pallets = await _db.Pallets
                .Include(p => p.Product)
                .Where(p => p.Status != PalletStatus.WrittenOff)
                .ToListAsync();

            var stock = pallets
                .GroupBy(p => p.Product!.Code)
                .Select(g => new
                {
                    code = g.Key,
                    name = g.First().Product!.Name,
                    unit = g.First().Product!.Unit,
                    inStorage = g.Where(p => p.Status == PalletStatus.Stored).Sum(p => p.Quantity),
                    onLine = g.Where(p => p.Status == PalletStatus.OnLine).Sum(p => p.Quantity),
                    receiving = g.Where(p => p.Status == PalletStatus.Received).Sum(p => p.Quantity),
                    quarantine = g.Where(p => p.Status == PalletStatus.Quarantine).Sum(p => p.Quantity),
                    rework = g.Where(p => p.Status == PalletStatus.Rework).Sum(p => p.Quantity),
                    claim = g.Where(p => p.Status == PalletStatus.Claim).Sum(p => p.Quantity),
                    // Total physical stock, including blocked stock and line-side pallets.
                    // WRITTEN_OFF pallets were excluded above.
                    total = g.Sum(p => p.Quantity)
                })
                .ToList();

            return Ok(stock);
        }

        [HttpPost("replenishments/{id}/priority")]
        public async Task<IActionResult> ChangePriority(int id, PriorityRequest req)
        {
            if (req.Priority < 1 || req.Priority > 5)
                return BadRequest(new { message = "The priority must be between 1 and 5" });

            var request = await _db.ReplenishmentRequests
                .Include(r => r.Product)
                .FirstOrDefaultAsync(r => r.Id == id);
            if (request == null)
                return NotFound(new { message = "Unknown requirement" });

            if (request.Status == "DONE")
                return BadRequest(new { message = "The request has already been dealt with" });

            var oldPriority = request.Priority;
            request.Priority = req.Priority;
            await _db.SaveChangesAsync();

            await _logger.LogAsync("PRIORITY_CHANGED", "", request.Product!.Code, request.Quantity,
                null, null, User.Identity?.Name,
                $"Požiadavka {request.Id}: priority {oldPriority} -> {req.Priority}");

            return Ok(new { message = "The priority has been changed" });
        }

        [HttpGet("products")]
        public async Task<IActionResult> GetProducts()
        {
            var products = await _db.Products.OrderBy(p => p.Code).ToListAsync();
            return Ok(products.Select(p => new { code = p.Code, name = p.Name, unit = p.Unit }));
        }

    }
}
