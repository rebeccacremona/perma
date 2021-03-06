# -*- coding: utf-8 -*-
# Generated by Django 1.11.11 on 2018-04-30 14:38
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('perma', '0029_auto_20180320_1812'),
    ]

    operations = [
        migrations.AddField(
            model_name='capturejob',
            name='message',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='capturejob',
            name='status',
            field=models.CharField(choices=[(b'pending', b'pending'), (b'in_progress', b'in_progress'), (b'completed', b'completed'), (b'deleted', b'deleted'), (b'failed', b'failed'), (b'invalid', b'invalid')], db_index=True, default=b'invalid', max_length=15),
        ),
    ]
