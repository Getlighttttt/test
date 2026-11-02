using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WmsApi.Data;
using WmsApi.Models;

namespace WmsApi.Controllers
{
    [ApiController]
    [Route("api/replenishment")]
    [Authorize]

    public class ReplenishmentController : ControllerBase
    {
        private readonly Db1Context _db;
        private readonly MovementLogger _logger;

        public ReplenishmentController(Db1Context db, MovementLogger logger) => (_db, _logger) = (db, logger);
        
        [Authorize(Roles = "Dispecer")]
        [HttpPost]
        public async Task<IActionResult> Create(CreateReplenishmentRequest req)
        {
            var product = await _db.Products.FirstOrDefaultAsync(p => p.Code == req.ProductCode);
            if (product == null)
            {
                return NotFound(new {message = "Unknown product" });
            }
            if(req.Quantity <= 0)
            {
                return BadRequest(new {message = "Invalid quantity" });
            }

            var replenishment = new ReplenishmentRequest()
            {
                ProductId = product.Id,
                LineName = req.LineName,
                Quantity = req.Quantity,
                Priority = req.Priority
            };
            _db.ReplenishmentRequests.Add(replenishment);
            await _db.SaveChangesAsync();
            return Ok(new { id = replenishment.Id });
        }

        [Authorize(Roles = "Skladnik,Dispecer")]
        [HttpGet("open")]
        public async Task<IActionResult> GetOpenReplenishments()
        {
            var openReplenishments = await _db.ReplenishmentRequests.Where(r => r.Status != "DONE").Include(r => r.Product).OrderBy(r => r.Priority).ThenBy(r => r.CreatedAt).ToListAsync();
            var openReplenishmentsResponse = openReplenishments.Select(r => new { id = r.Id, productCode = r.Product.Code, productName = r.Product.Name, quantity = r.Quantity, lineName = r.LineName, priority = r.Priority, status = r.Status, createdAt = r.CreatedAt });
            return Ok(openReplenishmentsResponse);
        }

        [Authorize(Roles = "Skladnik")]
        [HttpPost("{id}/send")]
        public async Task<IActionResult> Send(int id, SendToLineRequest req)
        {
            var replenishment = await _db.ReplenishmentRequests.FirstOrDefaultAsync(r => r.Id == id);
            if (replenishment == null)
            {
                return NotFound(new { message = "Unknown requirement" });
            }

            if(replenishment.Status == "DONE")
            {
                return BadRequest(new { message = "The recipe does not contain any incorrect information" });
            }

            var pallet = await _db.Pallets.Include(p => p.Product).Include(p => p.Location).FirstOrDefaultAsync(p => p.Code == req.PalletCode);
            if (pallet == null)
            {
                return NotFound(new { message = "An unknown palette" });
            }

            if(pallet.Status != PalletStatus.Stored)
            {
                return BadRequest(new { message = "The pallet is not in stock" });
            }

            if(pallet.ProductId != replenishment.ProductId)
            {
                return BadRequest(new { message = "The pallet is not suitable for this requirement" });
            }

            if(pallet.Location != null){
                pallet.Location.IsFree = true;
            }
            pallet.LocationId = null;
            pallet.Status = PalletStatus.OnLine;
            pallet.LineName = replenishment.LineName;
            replenishment.Status = "DONE";
            
            await _db.SaveChangesAsync();
            await _logger.LogAsync("TO_LINE", pallet.Code, pallet.Product!.Code, pallet.Quantity, Zone.Storage, Zone.LineBuffer, User.Identity?.Name, null);

            return Ok(new { message = "The pallet was sent to the production line" });

        }
    }
}
