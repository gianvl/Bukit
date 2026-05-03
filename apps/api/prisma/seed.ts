import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TIERS = [
  {
    slug: 'cleaning-studio',
    name: 'Studio',
    description: 'A thorough cleaning for studio units up to 30 sqm.',
    basePriceCentavos: 50_000,
    estimatedMinutes: 120,
    sortOrder: 1,
  },
  {
    slug: 'cleaning-1br',
    name: '1-Bedroom',
    description: 'Standard cleaning for a 1-bedroom condo or apartment.',
    basePriceCentavos: 70_000,
    estimatedMinutes: 180,
    sortOrder: 2,
  },
  {
    slug: 'cleaning-2br',
    name: '2-Bedroom',
    description: 'Standard cleaning for a 2-bedroom home up to 80 sqm.',
    basePriceCentavos: 100_000,
    estimatedMinutes: 240,
    sortOrder: 3,
  },
  {
    slug: 'cleaning-3br-plus',
    name: '3-Bedroom & up',
    description: 'Standard cleaning for larger homes 80 sqm and above.',
    basePriceCentavos: 140_000,
    estimatedMinutes: 300,
    sortOrder: 4,
  },
] as const

async function main() {
  for (const tier of TIERS) {
    await prisma.serviceTier.upsert({
      where: { slug: tier.slug },
      create: tier,
      update: tier,
    })
  }
  console.log(`Seeded ${TIERS.length} service tiers.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
