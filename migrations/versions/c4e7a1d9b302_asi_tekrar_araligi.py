"""asi gereklilikleri: tekrar_araligi_gun

Revision ID: c4e7a1d9b302
Revises: bf2318ce12e6
Create Date: 2026-11-22 02:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4e7a1d9b302'
down_revision = 'bf2318ce12e6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('asi_gereklilikleri', schema=None) as batch_op:
        batch_op.add_column(sa.Column('tekrar_araligi_gun', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('asi_gereklilikleri', schema=None) as batch_op:
        batch_op.drop_column('tekrar_araligi_gun')
